use anchor_lang::prelude::*;

#[account]
pub struct Config {
    /// Mint (Token-2022 mint) al que aplica el anti-ballena
    pub mint: Pubkey,

    /// Límite en basis points (1% = 100)
    pub max_hold_bps: u16,

    /// Authority temporal (solo setup). None => congelado/inmutable.
    pub authority: Option<Pubkey>,

    /// bump PDA
    pub bump: u8,
}

impl Config {
    pub const SEED: &'static [u8] = b"config";

    pub const LEN: usize =
        32 + // mint
        2  + // max_hold_bps
        1  + // Option tag
        32 + // authority (espacio reservado)
        1;   // bump
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum WhitelistKind {
    LiquidityPool = 0,
    EscrowVesting = 1,
}

#[account]
pub struct WhitelistEntry {
    pub config: Pubkey,
    pub wallet: Pubkey,
    pub kind: WhitelistKind,
    pub bump: u8,
}

impl WhitelistEntry {
    pub const SEED: &'static [u8] = b"whitelist";

    pub const LEN: usize =
        32 + // config
        32 + // wallet
        1  + // kind
        1;   // bump
}
