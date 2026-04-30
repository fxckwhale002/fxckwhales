# fxckwhales 🐋🚫

![Solana](https://img.shields.io/badge/Solana-Token--2022-purple)
![Anchor](https://img.shields.io/badge/Anchor-0.29-blue)
![Status](https://img.shields.io/badge/status-devnet%20ready-brightgreen)
![Tests](https://img.shields.io/badge/tests-passing-success)

A Solana Token-2022 transfer hook system for enforcing anti-whale token rules on-chain.

fxckwhales prevents wallets from holding more than a configured percentage of a token supply while allowing controlled exceptions via dynamic whitelist accounts.

---

## 🧠 Overview

fxckwhales enforces maximum token holding limits in real time on-chain using Token-2022 transfer hooks.

- Transfers above the allowed percentage are blocked
- Whitelisted accounts bypass restrictions
- Enforcement happens at protocol level

---

## ⚡ Quick Start

git clone https://github.com/fxckwhale002/fxckwhales.git
cd fxckwhales
npm install

ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
ANCHOR_WALLET=~/.config/solana/id.json \
npx ts-node cli/index.ts smoke-devnet

---

## 🚀 Devnet Program

Program ID:

9716KNRKwaXaD9CkeqVjHCnDhuhBpWE1MwaDFPLabREE

---

## 🏗️ Architecture

### Config PDA

Stores global configuration per mint:

- mint
- max_hold_bps
- authority
- bump

Derived using:

["config", mint]

---

### Whitelist Entry PDA

Stores exceptions for token accounts:

- config
- token account
- whitelist kind
- bump

Derived using:

["whitelist", config, token_account]

Important: whitelist applies to token accounts, not wallet owners.

---

## 🔄 Core Flow

1. Initialize config
2. Initialize Token-2022 transfer hook
3. Enforce max holding rule
4. Add whitelist entry
5. Allow bypass for whitelisted accounts
6. Remove whitelist
7. Automatically re-enable restrictions

---

## 🛠 CLI

npx ts-node cli/index.ts init-config <MINT> <MAX_HOLD_BPS>
npx ts-node cli/index.ts add-whitelist <MINT> <TOKEN_ACCOUNT>
npx ts-node cli/index.ts remove-whitelist <MINT> <TOKEN_ACCOUNT>
npx ts-node cli/index.ts smoke-devnet

---

## 🧪 Testing

anchor test

Includes:

- config initialization
- invalid parameter validation
- whitelist logic
- authorization checks
- config freeze behavior
- transfer validation

---

## 🧪 Devnet Smoke Test

The smoke test performs full real-world validation:

- creates Token-2022 mint
- enables transfer hook
- initializes config
- enforces 1% rule
- allows valid transfers
- blocks invalid transfers
- adds whitelist
- allows bypass
- removes whitelist
- re-enforces restriction

Expected result:

DEVNET SMOKE TEST PASSED

---

## 🔐 Security Model

- Only authority can modify whitelist
- Config can be frozen
- PDA prevents spoofing
- Transfer hook enforces rules on-chain

---

## ⚙️ Design Decisions

- Token-2022 hooks → real enforcement (not UI-based)
- PDA config → deterministic + secure
- O(1) whitelist lookup → efficient
- Token account whitelist → aligns with hook context

---

## 📌 Status

- Devnet deployment active
- Transfer hook fully working
- CLI ready
- Tests passing
- Smoke test validated

---

## 🧠 Vision

fxckwhales aims to become a reusable primitive for:

- fair-launch tokens
- anti-manipulation systems
- DeFi protections
- controlled token distribution

---

## 🗺 Roadmap

- Multisig authority
- Wallet-based whitelist
- Frontend dashboard
- Mainnet deployment
- Security audit

---

## ⚠️ Disclaimer

Experimental software. Not audited.

---

## 👤 Author

Built by @fxckwhale002


---

## 🎬 Terminal Demo

The full devnet smoke test was recorded with asciinema.

Recording file:

assets/demo.cast

