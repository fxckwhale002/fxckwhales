pub mod hook;
pub mod state;
use crate::state::{Config, WhitelistEntry, WhitelistKind};

use anchor_lang::prelude::*;


declare_id!("DTqD15g4omn9ncYgfHPu713nCWn1ccyJNUNdTYMMnFui");

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
        cfg.bump = ctx.bumps.config;

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
        entry.bump = ctx.bumps.entry;

        Ok(())
    }

    pub fn remove_whitelist(_ctx: Context<RemoveWhitelist>) -> Result<()> {
        // La cuenta `entry` se cierra sola por el atributo `close = authority`
        Ok(())
    }

    pub fn finalize_config(ctx: Context<FinalizeConfig>) -> Result<()> {
        let cfg = &mut ctx.accounts.config;
        let auth = cfg.authority.ok_or(FxckError::ConfigFrozen)?;
        require_keys_eq!(auth, ctx.accounts.authority.key(), FxckError::Unauthorized);

        cfg.authority = None;
        Ok(())
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

    /// CHECK: aquí solo guardamos la pubkey del mint.
    /// Más adelante podemos validarlo como Mint (token-2022) si quieres.
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

#[error_code]
pub enum FxckError {
    #[msg("Invalid basis points value")]
    InvalidBps,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Config is frozen")]
    ConfigFrozen,
}



