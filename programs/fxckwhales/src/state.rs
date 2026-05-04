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

/// ReceiverState tracks receiver-side accumulation timing.
///
/// It is designed for future time-based constraints such as:
/// - cooldown between receives
/// - anti-sniper launch windows
/// - velocity-based accumulation limits
///
/// PDA:
/// ["receiver-state", config, destination_token_account]
#[account]
pub struct ReceiverState {
    /// Config this receiver state belongs to.
    pub config: Pubkey,

    /// Destination token account being tracked.
    pub token_account: Pubkey,

    /// Last receive timestamp observed for this token account.
    pub last_receive_ts: i64,

    /// bump PDA
    pub bump: u8,
}

impl ReceiverState {
    pub const SEED: &'static [u8] = b"receiver-state";

    pub const LEN: usize =
        32 + // config
        32 + // token_account
        8  + // last_receive_ts
        1;   // bump
}
