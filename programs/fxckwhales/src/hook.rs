use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    account_info::AccountInfo,
    entrypoint::ProgramResult,
    program_error::ProgramError,
    pubkey::Pubkey,
};

use spl_token_2022::{
    extension::StateWithExtensions,
    state::{Account as TokenAccount, Mint},
};
use spl_transfer_hook_interface::instruction::TransferHookInstruction;

use crate::{
    state::{Config, WhitelistEntry},
    FxckError,
};

const BPS_DENOMINATOR: u128 = 10_000;

/// Dynamic accumulation tiers.
///
/// The hard max hold still applies first.
/// These tiers only add progressive friction as a destination approaches the max.
///
/// - below 50% of max: no extra restriction
/// - 50% to 80% of max: max single transfer = 20% of max
/// - 80% to 100% of max: max single transfer = 5% of max
const TIER_50_BPS: u128 = 5_000;
const TIER_80_BPS: u128 = 8_000;
const MID_TIER_TRANSFER_BPS: u128 = 2_000;
const HIGH_TIER_TRANSFER_BPS: u128 = 500;

pub fn try_process_transfer_hook<'info>(
    program_id: &Pubkey,
    accounts: &'info [AccountInfo<'info>],
    data: &[u8],
) -> Option<ProgramResult> {
    let instruction = TransferHookInstruction::unpack(data).ok()?;

    match instruction {
        TransferHookInstruction::Execute { amount } => {
            Some(process_execute(program_id, accounts, amount))
        }
        _ => Some(Err(ProgramError::InvalidInstructionData)),
    }
}

fn process_execute<'info>(
    program_id: &Pubkey,
    accounts: &'info [AccountInfo<'info>],
    amount: u64,
) -> ProgramResult {
    if accounts.len() < 6 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }

    let mint_ai = &accounts[1];
    let destination_token_ai = &accounts[2];
    let config_ai = &accounts[5];
    let whitelist_ai = accounts.get(6);

    validate_transfer_raw(
        program_id,
        mint_ai,
        destination_token_ai,
        config_ai,
        whitelist_ai,
        amount,
    )
    .map_err(Into::into)
}

pub fn validate_transfer<'info>(
    program_id: &Pubkey,
    mint_ai: &AccountInfo<'info>,
    destination_token_ai: &AccountInfo<'info>,
    config: &Account<'info, Config>,
    whitelist_ai: Option<&AccountInfo<'info>>,
    amount: u64,
) -> Result<()> {
    let mint_data = mint_ai.try_borrow_data()?;
    let mint_state = StateWithExtensions::<Mint>::unpack(&mint_data)
        .map_err(|_| error!(FxckError::InvalidMintAccount))?;
    let mint = mint_state.base;
    drop(mint_data);

    let destination_data = destination_token_ai.try_borrow_data()?;
    let destination_state = StateWithExtensions::<TokenAccount>::unpack(&destination_data)
        .map_err(|_| error!(FxckError::InvalidTokenAccount))?;
    let destination = destination_state.base;
    drop(destination_data);

    if is_whitelisted(
        program_id,
        config.key(),
        destination_token_ai.key(),
        whitelist_ai,
    )? {
        return Ok(());
    }

    // Debug / direct Anchor validation receives the destination balance before transfer.
    validate_dynamic_hold_rules_from_pre_balance(
        mint.supply,
        destination.amount,
        amount,
        config.max_hold_bps,
    )
}

pub fn validate_transfer_raw<'info>(
    program_id: &Pubkey,
    mint_ai: &AccountInfo<'info>,
    destination_token_ai: &AccountInfo<'info>,
    config_ai: &AccountInfo<'info>,
    whitelist_ai: Option<&AccountInfo<'info>>,
    amount: u64,
) -> Result<()> {
    let mint_data = mint_ai.try_borrow_data()?;
    let mint_state = StateWithExtensions::<Mint>::unpack(&mint_data)
        .map_err(|_| error!(FxckError::InvalidMintAccount))?;
    let mint = mint_state.base;
    drop(mint_data);

    let destination_data = destination_token_ai.try_borrow_data()?;
    let destination_state = StateWithExtensions::<TokenAccount>::unpack(&destination_data)
        .map_err(|_| error!(FxckError::InvalidTokenAccount))?;
    let destination = destination_state.base;
    drop(destination_data);

    let config_data = config_ai.try_borrow_data()?;
    let mut config_slice: &[u8] = &config_data;
    let config = Config::try_deserialize(&mut config_slice)
        .map_err(|_| error!(FxckError::InvalidConfigAccount))?;
    drop(config_data);

    if is_whitelisted(
        program_id,
        config_ai.key(),
        destination_token_ai.key(),
        whitelist_ai,
    )? {
        return Ok(());
    }

    // Token-2022 transfer hook execution observes the destination balance as the
    // post-transfer balance. So dynamic tiers must compare against the inferred
    // pre-transfer balance.
    validate_dynamic_hold_rules_from_post_balance(
        mint.supply,
        destination.amount,
        amount,
        config.max_hold_bps,
    )
}

fn validate_dynamic_hold_rules_from_pre_balance(
    supply: u64,
    pre_balance: u64,
    amount: u64,
    max_hold_bps: u16,
) -> Result<()> {
    let final_balance = pre_balance
        .checked_add(amount)
        .ok_or_else(|| error!(FxckError::MathOverflow))?;

    validate_dynamic_hold_rules(supply, pre_balance, final_balance, amount, max_hold_bps)
}

fn validate_dynamic_hold_rules_from_post_balance(
    supply: u64,
    post_balance: u64,
    amount: u64,
    max_hold_bps: u16,
) -> Result<()> {
    let pre_balance = post_balance
        .checked_sub(amount)
        .ok_or_else(|| error!(FxckError::MathOverflow))?;

    validate_dynamic_hold_rules(supply, pre_balance, post_balance, amount, max_hold_bps)
}

fn validate_dynamic_hold_rules(
    supply: u64,
    pre_balance: u64,
    final_balance: u64,
    amount: u64,
    max_hold_bps: u16,
) -> Result<()> {
    let max_allowed = calculate_bps_amount(supply, max_hold_bps as u128)?;

    // Hard anti-whale cap. This keeps the original anti-whale behavior.
    require!(final_balance <= max_allowed, FxckError::MaxHoldExceeded);

    let pre_balance_u128 = pre_balance as u128;
    let amount_u128 = amount as u128;

    let tier_50 = calculate_bps_amount_u128(max_allowed as u128, TIER_50_BPS)?;
    let tier_80 = calculate_bps_amount_u128(max_allowed as u128, TIER_80_BPS)?;

    if pre_balance_u128 < tier_50 {
        return Ok(());
    }

    let max_transfer_for_tier = if pre_balance_u128 < tier_80 {
        calculate_bps_amount_u128(max_allowed as u128, MID_TIER_TRANSFER_BPS)?
    } else {
        calculate_bps_amount_u128(max_allowed as u128, HIGH_TIER_TRANSFER_BPS)?
    };

    require!(
        amount_u128 <= max_transfer_for_tier,
        FxckError::DynamicHoldExceeded
    );

    Ok(())
}

fn calculate_bps_amount(base: u64, bps: u128) -> Result<u64> {
    let value = (base as u128)
        .checked_mul(bps)
        .ok_or_else(|| error!(FxckError::MathOverflow))?
        .checked_div(BPS_DENOMINATOR)
        .ok_or_else(|| error!(FxckError::MathOverflow))?;

    u64::try_from(value).map_err(|_| error!(FxckError::MathOverflow))
}

fn calculate_bps_amount_u128(base: u128, bps: u128) -> Result<u128> {
    base.checked_mul(bps)
        .ok_or_else(|| error!(FxckError::MathOverflow))?
        .checked_div(BPS_DENOMINATOR)
        .ok_or_else(|| error!(FxckError::MathOverflow))
}

fn is_whitelisted<'info>(
    program_id: &Pubkey,
    config_key: Pubkey,
    destination_token_key: Pubkey,
    whitelist_ai: Option<&AccountInfo<'info>>,
) -> Result<bool> {
    let Some(ai) = whitelist_ai else {
        return Ok(false);
    };

    if ai.owner != program_id {
        return Ok(false);
    }

    let data = ai.try_borrow_data()?;
    if data.is_empty() {
        return Ok(false);
    }

    let mut slice: &[u8] = &data;
    let entry = match WhitelistEntry::try_deserialize(&mut slice) {
        Ok(v) => v,
        Err(_) => return Ok(false),
    };

    Ok(entry.config == config_key && entry.wallet == destination_token_key)
}
