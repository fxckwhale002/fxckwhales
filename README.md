# fxckwhales 🐋🚫

A Solana Token-2022 transfer hook system for enforcing anti-whale token rules on-chain.

fxckwhales prevents wallets from holding more than a configured percentage of a token supply, while still allowing controlled exceptions through dynamic whitelist accounts.

---

## Highlights

- On-chain anti-whale enforcement
- Token-2022 transfer hook integration
- Configurable max holding limit
- Dynamic whitelist system
- Authority-controlled admin flow
- Remove-whitelist lifecycle support
- Local tests passing
- Devnet smoke test passing
- Admin CLI included

---

## Devnet Program

Program ID:

    9716KNRKwaXaD9CkeqVjHCnDhuhBpWE1MwaDFPLabREE

Latest successful devnet smoke test state:

    Mint: BJK6d4zGimC8CmNMEcHYqVwiDESAx3crw5R7Xwq7Ba3A
    Config PDA: 5rfpmRUd9qkT23KVcfa96XQkCdBidCddXCvzRZ2KYiN4
    ExtraAccountMetaList PDA: tQHPhUnaYSRiAyyxYESTp3acK9tCfDePX7pNqS1ezoU

---

## How It Works

fxckwhales uses Solana Token-2022 transfer hooks to validate every token transfer.

Before a transfer is accepted, the hook checks whether the destination token account would exceed the configured max holding limit.

If the destination is whitelisted, the transfer is allowed.

If the destination is not whitelisted and exceeds the limit, the transfer is blocked.

---

## Architecture

### Config PDA

Stores global configuration for one mint.

Fields:

- mint
- max_hold_bps
- authority
- bump

Derived with:

    ["config", mint]

---

### Whitelist Entry PDA

Stores an exception for a specific destination token account.

Fields:

- config
- token account
- whitelist kind
- bump

Derived with:

    ["whitelist", config, token_account]

Important: the current implementation whitelists token accounts, not wallet owners.

---

## Core Flow

1. Initialize config for a mint
2. Initialize Token-2022 ExtraAccountMetaList
3. Enforce max holding rule on transfer
4. Add whitelist entry if needed
5. Allow whitelisted destination to bypass limit
6. Remove whitelist entry
7. Re-apply anti-whale protection automatically

---

## CLI

Run help:

    npx ts-node cli/index.ts --help

Initialize config:

    npx ts-node cli/index.ts init-config <MINT> <MAX_HOLD_BPS>

Add whitelist:

    npx ts-node cli/index.ts add-whitelist <MINT> <TOKEN_ACCOUNT>

Remove whitelist:

    npx ts-node cli/index.ts remove-whitelist <MINT> <TOKEN_ACCOUNT>

Run devnet smoke test:

    ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
    ANCHOR_WALLET=~/.config/solana/id.json \
    npx ts-node cli/index.ts smoke-devnet

---

## Testing

Run all local tests:

    anchor test

Or run individual suites:

    npm run test:fxckwhales
    npm run test:hook
    npm run test:hook-real
    npm run test:all

Current status:

- 13 local tests passing
- Devnet smoke test passing
- CLI verified on devnet

---

## Devnet Smoke Test

The smoke test performs a full real-world validation:

- creates a Token-2022 mint
- enables the transfer hook
- initializes config
- initializes ExtraAccountMetaList
- mints total supply
- allows transfer below limit
- blocks transfer above limit
- adds whitelist
- allows whitelisted transfer
- removes whitelist
- blocks transfer again

Successful result:

    DEVNET SMOKE TEST PASSED

---

## Security Model

- Only authority can add whitelist entries
- Only authority can remove whitelist entries
- Config can be finalized/frozen
- PDAs prevent arbitrary spoofed config or whitelist accounts
- Transfer hook enforces rules during token movement

---

## Design Decisions

### Why Token-2022 transfer hooks?

Because enforcement happens at transfer time, directly on-chain.

### Why PDA-based config?

It guarantees one deterministic config per mint.

### Why dynamic whitelist PDAs?

It avoids iteration and allows constant-time lookup.

### Why whitelist token accounts?

Because Token-2022 transfer hooks receive token account context directly.

---

## Roadmap

- Admin CLI improvements
- Frontend dashboard
- Wallet owner-based whitelist option
- Multisig authority support
- Mainnet-ready deployment guide
- Security review
- Launch documentation

---

## Project Status

fxckwhales is currently a working devnet prototype with:

- deployed Solana program
- transfer hook enforcement
- dynamic whitelist lifecycle
- CLI tooling
- smoke-tested Token-2022 flow

---

## Disclaimer

This is experimental software and has not been audited.

Use at your own risk.

---

## Author

Built by @fxckwhale002

