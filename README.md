# fxckwhales 🐋🚫

![Solana](https://img.shields.io/badge/Solana-Token--2022-purple)
![Anchor](https://img.shields.io/badge/Anchor-0.29-blue)
![Status](https://img.shields.io/badge/status-devnet%20ready-brightgreen)
![Tests](https://img.shields.io/badge/tests-passing-success)

A Solana Token-2022 transfer hook system for enforcing **on-chain token distribution constraints**.

Originally built as an anti-whale mechanism, fxckwhales evolved into a **dynamic constraint engine** that progressively limits token accumulation directly at the protocol level.

---

## 🧠 Overview

fxckwhales enforces token holding rules **in real time on-chain** using Token-2022 transfer hooks.

Instead of relying on UI checks or off-chain logic, all constraints are executed inside the token transfer itself.

* Hard max holding per token account
* Dynamic accumulation limits
* Whitelist-based exceptions
* Fully enforced at protocol level

---

## ⚡ Quick Start

```bash
git clone https://github.com/fxckwhale002/fxckwhales.git
cd fxckwhales
npm install

ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
ANCHOR_WALLET=~/.config/solana/id.json \
npx ts-node cli/index.ts smoke-devnet
```

---

## 🚀 Devnet Program

Program ID:

9716KNRKwaXaD9CkeqVjHCnDhuhBpWE1MwaDFPLabREE

---

## 🏗️ Architecture

### Config PDA

Stores global configuration per mint:

* mint
* max_hold_bps
* authority
* bump

Derived using:

```
["config", mint]
```

---

### Whitelist Entry PDA

Stores exceptions for token accounts:

* config
* token account
* whitelist kind
* bump

Derived using:

```
["whitelist", config, token_account]
```

Whitelist applies to **token accounts**, not wallet owners.

---

## 🧠 Dynamic Max Hold

Instead of a fixed max holding limit, fxckwhales introduces **progressive accumulation constraints**:

* <50% of max → no restriction
* 50–80% → limited transfer size
* 80–100% → highly restricted transfers
* > 100% → blocked

This creates a smoother distribution curve and makes large accumulation significantly harder over time.

---

## 🔄 Core Flow

1. Initialize config
2. Initialize Token-2022 transfer hook
3. Enforce max holding rule
4. Apply dynamic accumulation constraints
5. Add whitelist entry
6. Allow bypass for whitelisted accounts
7. Remove whitelist
8. Automatically re-enable restrictions

---

## 🛠 CLI

```
npx ts-node cli/index.ts init-config <MINT> <MAX_HOLD_BPS>
npx ts-node cli/index.ts add-whitelist <MINT> <TOKEN_ACCOUNT>
npx ts-node cli/index.ts remove-whitelist <MINT> <TOKEN_ACCOUNT>
npx ts-node cli/index.ts smoke-devnet
```

---

## 🧪 Testing

```
anchor test
```

Includes:

* config initialization
* invalid parameter validation
* whitelist logic
* authorization checks
* config freeze behavior
* transfer validation
* dynamic constraint validation

---

## 🧪 Devnet Smoke Test

The smoke test performs full real-world validation:

* creates Token-2022 mint
* enables transfer hook
* initializes config
* enforces holding limits
* applies dynamic constraints
* allows valid transfers
* blocks invalid transfers
* adds whitelist
* allows bypass
* removes whitelist
* re-enforces restriction

Expected result:

```
DEVNET SMOKE TEST PASSED
```

---

## 🔐 Security Model

* Only authority can modify whitelist
* Config can be frozen
* PDA prevents spoofing
* Transfer hook enforces rules on-chain
* No reliance on frontend or off-chain checks

---

## ⚙️ Design Decisions

* Token-2022 hooks → real enforcement (not UI-based)
* PDA config → deterministic + secure
* O(1) whitelist lookup → efficient
* Token account whitelist → aligns with hook context
* Dynamic constraints → smoother distribution vs hard caps

---

## 📌 Status

* Devnet deployment active
* Transfer hook fully working
* Dynamic constraints implemented
* CLI ready
* Tests passing
* Smoke test validated

---

## 🧠 Vision

fxckwhales aims to become a reusable primitive for:

* fair-launch tokens
* anti-manipulation systems
* DeFi protections
* controlled token distribution
* on-chain token policy engines

---

## 🗺 Roadmap

* Multisig authority
* Wallet-based whitelist
* Time-based transfer constraints
* Frontend dashboard
* Mainnet deployment
* Security audit

---

## ⚠️ Disclaimer

Experimental software. Not audited.

---

## 👤 Author

Built by @fxckwhale002
