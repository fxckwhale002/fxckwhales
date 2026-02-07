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

/// Devuelve Ok(()) si `wallet` está whitelisted (hay una WhitelistEntry PDA presente),
/// si no, devuelve Err y aplicaremos el límite.
fn is_whitelisted(entry_ai: &AccountInfo, config_key: &Pubkey, wallet: &Pubkey) -> bool {
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



/// Handler del Transfer Hook (se ejecuta en CADA transferencia Token-2022).
/// Regla: si el DESTINO no está whitelisted, su balance final no puede superar 1% del supply.
pub fn process_execute<'a>(
    _program_id: &Pubkey,
    accounts: &'a [AccountInfo<'a>],
    amount: u64,
) -> ProgramResult {

    // Layout base del Execute del transfer hook:
    // [0] source token account
    // [1] mint
    // [2] destination token account
    // [3] owner (o authority) - depende del flujo
    // Luego vienen "extra accounts" (las que nosotros pedimos vía ExtraAccountMetaList).
    //
    // Nosotros vamos a asumir que hemos añadido como extras:
    // [4] config PDA
    // [5] whitelist entry PDA (para el DESTINO)  (opcional / puede ir vacío)
    //
    // Más adelante lo dejaremos perfecto registrando ExtraAccountMetaList.
    if accounts.len() < 5 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }

    let mint_ai = &accounts[1];
    let dest_token_ai = &accounts[2];

    // Extra accounts (asumidos)
    let config_ai = &accounts[4];

    // whitelist entry puede no venir (si aún no lo configuramos), por eso lo tratamos como opcional
    let wl_entry_ai = accounts.get(5);

    // Cargar Config (Anchor account)
    let config = Account::<Config>::try_from(config_ai)
        .map_err(|_| ProgramError::InvalidAccountData)?;

    // Leer mint (Token-2022 mint state)
    let mint_data = mint_ai.try_borrow_data().map_err(|_| ProgramError::AccountBorrowFailed)?;
    let mint_state = Mint::unpack(&mint_data[..Mint::LEN])
    .map_err(|_| ProgramError::InvalidAccountData)?;

    let supply = mint_state.supply;

    // Calcular máximo permitido por wallet (bps)
    let max_allowed = (supply as u128)
        .saturating_mul(config.max_hold_bps as u128)
        / 10_000u128;

    // Leer token account destino (Token-2022 account state)
    let dest_data = dest_token_ai.try_borrow_data().map_err(|_| ProgramError::AccountBorrowFailed)?;
    let dest_state = TokenAccount::unpack(&dest_data[..TokenAccount::LEN])
    .map_err(|_| ProgramError::InvalidAccountData)?;

    let dest_owner = dest_state.owner;
    let dest_balance = dest_state.amount;

    // Si está whitelisted, permitir
    if let Some(wl_ai) = wl_entry_ai {
        if is_whitelisted(wl_ai, &config.key(), &dest_owner) {
            return Ok(());
        }
    }

    // Balance final = balance actual + amount recibido
    let final_balance = (dest_balance as u128).saturating_add(amount as u128);

    if final_balance > max_allowed {
        // Bloqueo anti-ballena
        return Err(ProgramError::Custom(0xF00D)); // luego lo cambiamos por un error_code bonito
    }

    Ok(())
}

/// Router del hook: si el instruction data es TransferHookInstruction::Execute, lo procesamos.
pub fn try_process_transfer_hook<'a>(
    program_id: &Pubkey,
    accounts: &'a [AccountInfo<'a>],
    data: &[u8],
) -> Option<ProgramResult> {

    let ix = TransferHookInstruction::unpack(data).ok()?;
    match ix {
        TransferHookInstruction::Execute { amount } => Some(process_execute(program_id, accounts, amount)),
        _ => None,
    }
}
