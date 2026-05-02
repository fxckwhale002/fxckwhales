pub mod hook;
pub mod state;

use anchor_lang::{prelude::*, Discriminator};
use anchor_lang::solana_program::{
    account_info::AccountInfo,
    entrypoint::ProgramResult,
    program_error::ProgramError,
    pubkey::Pubkey,
};
use anchor_lang::system_program::{create_account, CreateAccount};

use spl_tlv_account_resolution::{
    account::ExtraAccountMeta,
    seeds::Seed,
    state::ExtraAccountMetaList,
};
use spl_transfer_hook_interface::instruction::ExecuteInstruction;

use crate::state::{Config, WhitelistEntry, WhitelistKind};

declare_id!("9716KNRKwaXaD9CkeqVjHCnDhuhBpWE1MwaDFPLabREE");

#[program]
pub mod fxckwhales {
    use super::*;

    pub fn initialize_config(ctx: Context<InitializeConfig>, max_hold_bps: u16) -> Result<()> {
        require!(
            max_hold_bps > 0 && max_hold_bps <= 10_000,
            FxckError::InvalidBps
        );

        let cfg = &mut ctx.accounts.config;
        cfg.mint = ctx.accounts.mint.key();
        cfg.max_hold_bps = max_hold_bps;
        cfg.authority = Some(ctx.accounts.authority.key());
        cfg.bump = *ctx.bumps.get("config").unwrap();

        Ok(())
    }

    pub fn initialize_extra_account_meta_list(
        ctx: Context<InitializeExtraAccountMetaList>,
    ) -> Result<()> {
        let account_metas = vec![
            ExtraAccountMeta::new_with_pubkey(&ctx.accounts.config.key(), false, false)
                .map_err(|_| error!(FxckError::InvalidExtraAccountMetaList))?,
            ExtraAccountMeta::new_with_seeds(
                &[
                    Seed::Literal {
                        bytes: WhitelistEntry::SEED.to_vec(),
                    },
                    Seed::AccountKey { index: 5 },
                    Seed::AccountKey { index: 2 },
                ],
                false,
                false,
            )
            .map_err(|_| error!(FxckError::InvalidExtraAccountMetaList))?,
        ];

        let account_size = ExtraAccountMetaList::size_of(account_metas.len())
            .map_err(|_| error!(FxckError::InvalidExtraAccountMetaList))?;

        let lamports = Rent::get()?.minimum_balance(account_size);

        let mint_key = ctx.accounts.mint.key();
        let bump = *ctx.bumps.get("extra_account_meta_list").unwrap();

        let signer_seeds: &[&[&[u8]]] = &[&[
            b"extra-account-metas",
            mint_key.as_ref(),
            &[bump],
        ]];

        create_account(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                CreateAccount {
                    from: ctx.accounts.authority.to_account_info(),
                    to: ctx.accounts.extra_account_meta_list.to_account_info(),
                },
            )
            .with_signer(signer_seeds),
            lamports,
            account_size as u64,
            ctx.program_id,
        )?;

        ExtraAccountMetaList::init::<ExecuteInstruction>(
            &mut ctx
                .accounts
                .extra_account_meta_list
                .try_borrow_mut_data()?,
            &account_metas,
        )
        .map_err(|_| error!(FxckError::InvalidExtraAccountMetaList))?;

        Ok(())
    }

    pub fn add_whitelist(ctx: Context<AddWhitelist>, kind: WhitelistKind) -> Result<()> {
        let cfg = &ctx.accounts.config;
        let auth = cfg.authority.ok_or(FxckError::ConfigFrozen)?;
        require_keys_eq!(auth, ctx.accounts.authority.key(), FxckError::Unauthorized);

        let entry = &mut ctx.accounts.entry;
        entry.config = cfg.key();
        entry.wallet = ctx.accounts.wallet.key();
        entry.kind = kind;
        entry.bump = *ctx.bumps.get("entry").unwrap();

        Ok(())
    }

    pub fn remove_whitelist(ctx: Context<RemoveWhitelist>) -> Result<()> {
        let cfg = &ctx.accounts.config;
        let auth = cfg.authority.ok_or(FxckError::ConfigFrozen)?;
        require_keys_eq!(auth, ctx.accounts.authority.key(), FxckError::Unauthorized);

        Ok(())
    }

    pub fn finalize_config(ctx: Context<FinalizeConfig>) -> Result<()> {
        let cfg = &mut ctx.accounts.config;
        let auth = cfg.authority.ok_or(FxckError::ConfigFrozen)?;
        require_keys_eq!(auth, ctx.accounts.authority.key(), FxckError::Unauthorized);

        cfg.authority = None;
        Ok(())
    }

    pub fn debug_validate_transfer(
        ctx: Context<DebugValidateTransfer>,
        amount: u64,
    ) -> Result<()> {
        hook::validate_transfer(
            &crate::ID,
            &ctx.accounts.mint.to_account_info(),
            &ctx.accounts.destination_token.to_account_info(),
            &ctx.accounts.config,
            ctx.accounts.whitelist_entry.as_ref().map(|a| a.as_ref()),
            amount,
        )
    }

    pub fn transfer_hook(ctx: Context<TransferHook>, amount: u64) -> Result<()> {
        hook::validate_transfer(
            &crate::ID,
            &ctx.accounts.mint.to_account_info(),
            &ctx.accounts.destination_token.to_account_info(),
            &ctx.accounts.config,
            ctx.accounts.whitelist_entry.as_ref().map(|a| a.as_ref()),
            amount,
        )
    }
}

anchor_lang::solana_program::entrypoint!(process_instruction);

pub fn process_instruction<'info>(
    program_id: &Pubkey,
    accounts: &'info [AccountInfo<'info>],
    data: &[u8],
) -> ProgramResult {
    if let Some(res) = hook::try_process_transfer_hook(program_id, accounts, data) {
        return res;
    }

    if data.len() < 8 {
        return Err(ProgramError::InvalidInstructionData);
    }

    let disc: [u8; 8] = data[..8]
        .try_into()
        .map_err(|_| ProgramError::InvalidInstructionData)?;

    if disc == instruction::InitializeConfig::DISCRIMINATOR {
        return __private::__global::initialize_config(program_id, accounts, &data[8..])
            .map_err(Into::into);
    }

    if disc == instruction::InitializeExtraAccountMetaList::DISCRIMINATOR {
        return __private::__global::initialize_extra_account_meta_list(
            program_id,
            accounts,
            &data[8..],
        )
        .map_err(Into::into);
    }

    if disc == instruction::AddWhitelist::DISCRIMINATOR {
        return __private::__global::add_whitelist(program_id, accounts, &data[8..])
            .map_err(Into::into);
    }

    if disc == instruction::RemoveWhitelist::DISCRIMINATOR {
        return __private::__global::remove_whitelist(program_id, accounts, &data[8..])
            .map_err(Into::into);
    }

    if disc == instruction::FinalizeConfig::DISCRIMINATOR {
        return __private::__global::finalize_config(program_id, accounts, &data[8..])
            .map_err(Into::into);
    }

    if disc == instruction::DebugValidateTransfer::DISCRIMINATOR {
        return __private::__global::debug_validate_transfer(program_id, accounts, &data[8..])
            .map_err(Into::into);
    }

    if disc == instruction::TransferHook::DISCRIMINATOR {
        return __private::__global::transfer_hook(program_id, accounts, &data[8..])
            .map_err(Into::into);
    }

    Err(ProgramError::InvalidInstructionData)
}

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + Config::LEN,
        seeds = [Config::SEED, mint.key().as_ref()],
        bump
    )]
    pub config: Account<'info, Config>,

    /// CHECK: aquí solo guardamos la pubkey del mint
    pub mint: UncheckedAccount<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializeExtraAccountMetaList<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: PDA que almacena la ExtraAccountMetaList
    #[account(
        mut,
        seeds = [b"extra-account-metas", mint.key().as_ref()],
        bump
    )]
    pub extra_account_meta_list: UncheckedAccount<'info>,

    /// CHECK: solo usamos la pubkey
    pub mint: UncheckedAccount<'info>,

    #[account(
        seeds = [Config::SEED, mint.key().as_ref()],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AddWhitelist<'info> {
    #[account(
        mut,
        seeds = [Config::SEED, config.mint.as_ref()],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,

    /// CHECK: solo usamos su pubkey
    pub wallet: UncheckedAccount<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + WhitelistEntry::LEN,
        seeds = [WhitelistEntry::SEED, config.key().as_ref(), wallet.key().as_ref()],
        bump
    )]
    pub entry: Account<'info, WhitelistEntry>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RemoveWhitelist<'info> {
    #[account(
        seeds = [Config::SEED, config.mint.as_ref()],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,

    /// CHECK: solo usamos su pubkey
    pub wallet: UncheckedAccount<'info>,

    #[account(
        mut,
        close = authority,
        seeds = [WhitelistEntry::SEED, config.key().as_ref(), wallet.key().as_ref()],
        bump = entry.bump
    )]
    pub entry: Account<'info, WhitelistEntry>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FinalizeConfig<'info> {
    #[account(
        mut,
        seeds = [Config::SEED, config.mint.as_ref()],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,

    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct DebugValidateTransfer<'info> {
    /// CHECK: mint token-2022 leído manualmente
    pub mint: UncheckedAccount<'info>,

    /// CHECK: token account destino leído manualmente
    pub destination_token: UncheckedAccount<'info>,

    #[account(
        seeds = [Config::SEED, config.mint.as_ref()],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,

    /// CHECK: opcional, se valida manualmente dentro del hook
    pub whitelist_entry: Option<UncheckedAccount<'info>>,
}

#[derive(Accounts)]
pub struct TransferHook<'info> {
    /// CHECK: cuenta token origen
    pub source_token: UncheckedAccount<'info>,

    /// CHECK: mint token-2022
    pub mint: UncheckedAccount<'info>,

    /// CHECK: cuenta token destino
    pub destination_token: UncheckedAccount<'info>,

    /// CHECK: owner/delegate de la transferencia
    pub owner: UncheckedAccount<'info>,

    /// CHECK: cuenta PDA de extra-account-metas
    pub extra_account_meta_list: UncheckedAccount<'info>,

    #[account(
        seeds = [Config::SEED, mint.key().as_ref()],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,

    /// CHECK: PDA dinámica de whitelist del token account destino
    pub whitelist_entry: Option<UncheckedAccount<'info>>,
}

#[error_code]
pub enum FxckError {
    #[msg("Invalid basis points value")]
    InvalidBps,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Config is frozen")]
    ConfigFrozen,
    #[msg("Destination holding exceeds the configured max_hold_bps")]
    MaxHoldExceeded,
    #[msg("Dynamic max hold tier transfer limit exceeded")]
    DynamicHoldExceeded,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Invalid mint account")]
    InvalidMintAccount,
    #[msg("Invalid token account")]
    InvalidTokenAccount,
    #[msg("Invalid config account")]
    InvalidConfigAccount,
    #[msg("Invalid extra account meta list")]
    InvalidExtraAccountMetaList,
    #[msg("Invalid transfer hook instruction")]
    InvalidTransferHookInstruction,
}
