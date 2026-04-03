use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    account_info::AccountInfo,
    program_pack::Pack,
};

use spl_token_2022::state::{Account as TokenAccount, Mint};

use crate::{
    state::{Config, WhitelistEntry},
    FxckError,
};

pub fn validate_transfer<'info>(
    program_id: &Pubkey,
    mint_ai: &AccountInfo<'info>,
    destination_token_ai: &AccountInfo<'info>,
    config: &Account<'info, Config>,
    whitelist_ai: Option<&AccountInfo<'info>>,
    amount: u64,
) -> Result<()> {
    let mint_data = mint_ai.try_borrow_data()?;
    let mint = Mint::unpack(&mint_data)
        .map_err(|_| error!(FxckError::InvalidMintAccount))?;
    drop(mint_data);

    let destination_data = destination_token_ai.try_borrow_data()?;
    let destination = TokenAccount::unpack(&destination_data)
        .map_err(|_| error!(FxckError::InvalidTokenAccount))?;
    drop(destination_data);

    if is_whitelisted(program_id, config, &destination, whitelist_ai)? {
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
    config: &Account<'info, Config>,
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

    Ok(entry.config == config.key() && entry.wallet == destination.owner)
}
