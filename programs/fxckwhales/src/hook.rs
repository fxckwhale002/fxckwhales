use anchor_lang::solana_program::program_pack::Pack;
use anchor_lang::AccountDeserialize;

use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    account_info::AccountInfo,
    entrypoint::ProgramResult,
    program_error::ProgramError,
    pubkey::Pubkey,
};
use spl_transfer_hook_interface::instruction::TransferHookInstruction;
use spl_token_2022::state::{Account as TokenAccount, Mint};

use crate::state::{Config, WhitelistEntry};

fn is_whitelisted<'info>(
    entry_ai: &AccountInfo<'info>,
    config_key: &Pubkey,
    wallet: &Pubkey,
) -> bool {
    if entry_ai.data_is_empty() {
        return false;
    }
    let data_ref = entry_ai.data.borrow();
    let mut data: &[u8] = &data_ref;

    if let Ok(entry) = WhitelistEntry::try_deserialize(&mut data) {
        entry.config == *config_key && entry.wallet == *wallet
    } else {
        false
    }
}

pub fn process_execute<'info>(
    _program_id: &Pubkey,
    accounts: &'info [AccountInfo<'info>],
    amount: u64,
) -> ProgramResult {
    if accounts.len() < 5 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }

    let mint_ai = &accounts[1];
    let dest_token_ai = &accounts[2];

    let config_ai = &accounts[4];
    let wl_entry_ai = accounts.get(5);

    // ✅ ahora compila porque accounts vive `'info`
    let config = Account::<Config>::try_from(config_ai)
        .map_err(|_| ProgramError::InvalidAccountData)?;

    let mint_data = mint_ai
        .try_borrow_data()
        .map_err(|_| ProgramError::AccountBorrowFailed)?;
    let mint_state = Mint::unpack(&mint_data[..Mint::LEN])
        .map_err(|_| ProgramError::InvalidAccountData)?;

    let supply = mint_state.supply;

    let max_allowed = (supply as u128)
        .saturating_mul(config.max_hold_bps as u128)
        / 10_000u128;

    let dest_data = dest_token_ai
        .try_borrow_data()
        .map_err(|_| ProgramError::AccountBorrowFailed)?;
    let dest_state = TokenAccount::unpack(&dest_data[..TokenAccount::LEN])
        .map_err(|_| ProgramError::InvalidAccountData)?;

    let dest_owner = dest_state.owner;
    let dest_balance = dest_state.amount;

    if let Some(wl_ai) = wl_entry_ai {
        if is_whitelisted(wl_ai, &config.key(), &dest_owner) {
            return Ok(());
        }
    }

    let final_balance = (dest_balance as u128).saturating_add(amount as u128);

    if final_balance > max_allowed {
        return Err(ProgramError::Custom(0xF00D));
    }

    Ok(())
}

pub fn try_process_transfer_hook<'info>(
    program_id: &Pubkey,
    accounts: &'info [AccountInfo<'info>],
    data: &[u8],
) -> Option<ProgramResult> {
    let ix = TransferHookInstruction::unpack(data).ok()?;
    match ix {
        TransferHookInstruction::Execute { amount } => {
            Some(process_execute(program_id, accounts, amount))
        }
        _ => None,
    }
}
