# fxckwhales Roadmap 🐋🚫

This roadmap tracks the next milestones for fxckwhales after the first devnet-ready release.

---

## v0.1.0 — Devnet-ready anti-whale hook

Status: completed

- Token-2022 transfer hook integration
- Config PDA per mint
- Max holding enforcement
- Dynamic whitelist PDA
- Add whitelist flow
- Remove whitelist flow
- Local test suite
- Devnet deployment
- Devnet smoke test
- Admin CLI

---

## v0.2.0 — Admin and safety improvements

Status: planned

Goals:

- Improve CLI UX
- Add better command output
- Add config inspection command
- Add whitelist inspection command
- Add safer error messages
- Add README examples for common admin flows

Potential commands:

- show-config
- show-whitelist
- derive-pdas
- freeze-config

---

## v0.3.0 — Whitelist model expansion

Status: planned

Goals:

- Add optional wallet-owner whitelist mode
- Keep token-account whitelist mode
- Document tradeoffs between both modes
- Add tests for both whitelist models

Why:

The current implementation whitelists destination token accounts because Token-2022 transfer hooks receive token account context directly.

A wallet-owner whitelist can improve UX, but requires additional token account owner validation.

---

## v0.4.0 — Multisig authority

Status: planned

Goals:

- Move authority control to multisig
- Support safer admin operations
- Reduce single-key risk
- Document Squads or equivalent multisig setup

Why:

Admin authority controls whitelist and config finalization. Multisig improves trust and operational security.

---

## v0.5.0 — Frontend dashboard

Status: planned

Goals:

- Wallet connection
- View config
- Add whitelist entry
- Remove whitelist entry
- Run PDA derivation client-side
- Display devnet program status

---

## v0.6.0 — Mainnet readiness

Status: planned

Goals:

- Security checklist
- Deployment checklist
- Authority management guide
- Upgrade strategy
- Program size optimization
- Mainnet cost estimation
- Final risk review

---

## Long-term ideas

- Audit report
- Governance integration
- Multiple whitelist kinds
- Per-kind limits
- Time-based whitelist expiration
- Treasury and LP policy modules
- Public docs site

---

## Current stable release

v0.1.0

Devnet Program:

9716KNRKwaXaD9CkeqVjHCnDhuhBpWE1MwaDFPLabREE

