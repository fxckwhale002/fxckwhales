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
    if accounts.len() < 5 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }

    let mint_ai = &accounts[1];
    let destination_token_ai = &accounts[3];
    let config_ai = &accounts[4];
    let whitelist_ai = accounts.get(5);

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
    msg!("validate_transfer: start");
    msg!("program_id: {}", program_id);
    msg!("mint_ai.key: {}", mint_ai.key());
    msg!("mint_ai.owner: {}", mint_ai.owner);
    msg!("mint_ai.data_len: {}", mint_ai.data_len());

    msg!("destination_token_ai.key: {}", destination_token_ai.key());
    msg!("destination_token_ai.owner: {}", destination_token_ai.owner);
    msg!("destination_token_ai.data_len: {}", destination_token_ai.data_len());

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

    msg!("destination.owner field: {}", destination.owner);
    msg!("destination.amount: {}", destination.amount);

    if is_whitelisted(program_id, config.key(), &destination, whitelist_ai)? {
        return Ok(());
    }

    let max_allowed_u128 = (mint.supply as u128)
        .checked_mul(config.max_hold_bps as u128)
        .ok_or_else(|| error!(FxckError::MathOverflow))?
        .checked_div(10_000)
        .ok_or_else(|| error!(FxckError::MathOverflow))?;

    let max_allowed =
        u64::try_from(max_allowed_u128).map_err(|_| error!(FxckError::MathOverflow))?;

    let final_balance = destination
        .amount
        .checked_add(amount)
        .ok_or_else(|| error!(FxckError::MathOverflow))?;

    require!(final_balance <= max_allowed, FxckError::MaxHoldExceeded);

    Ok(())
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

    if is_whitelisted(program_id, config_ai.key(), &destination, whitelist_ai)? {
        return Ok(());
    }

    let max_allowed_u128 = (mint.supply as u128)
        .checked_mul(config.max_hold_bps as u128)
        .ok_or_else(|| error!(FxckError::MathOverflow))?
        .checked_div(10_000)
        .ok_or_else(|| error!(FxckError::MathOverflow))?;

    let max_allowed =
        u64::try_from(max_allowed_u128).map_err(|_| error!(FxckError::MathOverflow))?;

    let final_balance = destination
        .amount
        .checked_add(amount)
        .ok_or_else(|| error!(FxckError::MathOverflow))?;

    require!(final_balance <= max_allowed, FxckError::MaxHoldExceeded);

    Ok(())
}

fn is_whitelisted<'info>(
    program_id: &Pubkey,
    config_key: Pubkey,
    destination: &TokenAccount,
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

    Ok(entry.config == config_key && entry.wallet == destination.owner)
}
