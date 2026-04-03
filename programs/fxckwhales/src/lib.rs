pub mod hook;
pub mod state;

use anchor_lang::prelude::*;

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

    pub fn remove_whitelist(_ctx: Context<RemoveWhitelist>) -> Result<()> {
        Ok(())
    }

    pub fn finalize_config(ctx: Context<FinalizeConfig>) -> Result<()> {
        let cfg = &mut ctx.accounts.config;
        let auth = cfg.authority.ok_or(FxckError::ConfigFrozen)?;
        require_keys_eq!(auth, ctx.accounts.authority.key(), FxckError::Unauthorized);

        cfg.authority = None;
        Ok(())
    }

    
    pub fn transfer_hook(ctx: Context<TransferHook>, amount: u64) -> Result<()> {
        hook::validate_transfer(
            &crate::ID,
            &ctx.accounts.mint.to_account_info(),
            &ctx.accounts.destination_token.to_account_info(),
            &ctx.accounts.config,
            Some(&ctx.accounts.whitelist_entry.to_account_info()),
            amount,
        )
    }
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

    /// CHECK
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
pub struct TransferHook<'info> {
    /// CHECK: cuenta token origen
    pub source_token: UncheckedAccount<'info>,

    /// CHECK: mint token-2022
    pub mint: UncheckedAccount<'info>,

    /// CHECK: cuenta token destino
    pub destination_token: UncheckedAccount<'info>,

    /// CHECK: owner/delegate de la transferencia
    pub owner: UncheckedAccount<'info>,

    /// CHECK: extra-account-meta-list del transfer hook
    pub extra_account_meta_list: UncheckedAccount<'info>,

    #[account(
        seeds = [Config::SEED, mint.key().as_ref()],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,

    /// CHECK: se valida manualmente dentro del hook
    pub whitelist_entry: UncheckedAccount<'info>,
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
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Invalid mint account")]
    InvalidMintAccount,
    #[msg("Invalid token account")]
    InvalidTokenAccount,
}
