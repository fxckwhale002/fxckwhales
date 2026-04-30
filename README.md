# fxckwhales 🐋🚫

Anti-whale token enforcement system built on Solana using Token-2022 transfer hooks.

---

## 🧠 Overview

fxckwhales is a smart contract system that enforces maximum token holding limits per wallet in real time.

It prevents large holders ("whales") from accumulating excessive supply while allowing controlled exceptions via a whitelist system.

---

## ⚙️ Core Features

- Max holding enforcement (e.g. 1% per wallet)
- Real-time validation on every transfer
- Whitelist system (per token account)
- Config freezing (immutable mode)
- Token-2022 transfer hook integration
- PDA-based deterministic architecture

---

## 🏗️ Architecture

### Config PDA

Stores global rules for a token:

- mint
- max_hold_bps
- authority
- frozen state

Derived using:

["config", mint]

---

### Whitelist Entry PDA

Stores allowed accounts:

- token account (NOT wallet owner)
- whitelist type
- linked config

Derived using:

["whitelist", config, token_account]

---

## 🚀 Devnet Deployment

Program ID:

9716KNRKwaXaD9CkeqVjHCnDhuhBpWE1MwaDFPLabREE

---

## 🧪 Smoke Test (Devnet)

Run full real-world validation:

ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
ANCHOR_WALLET=~/.config/solana/id.json \
npx ts-node cli/index.ts smoke-devnet

This test:

- Creates Token-2022 mint
- Initializes config
- Enforces 1% rule
- Tests whitelist bypass
- Removes whitelist and re-tests restriction

---

## 🛠 CLI Usage

npx ts-node cli/index.ts init-config <MINT> <MAX_HOLD_BPS>  
npx ts-node cli/index.ts add-whitelist <MINT> <TOKEN_ACCOUNT>  
npx ts-node cli/index.ts remove-whitelist <MINT> <TOKEN_ACCOUNT>  
npx ts-node cli/index.ts smoke-devnet  

---

## 🧪 Local Testing

anchor test

Includes:

- config initialization
- invalid parameters
- whitelist logic
- authorization checks
- freeze behavior
- transfer validation

---

## 🔐 Key Design Decisions

- PDA-based architecture → deterministic and secure
- Token account-based whitelist → avoids ownership ambiguity
- Transfer hooks → enforcement at protocol level
- Config freezing → prevents post-deploy manipulation

---

## 📌 Status

- Fully functional on devnet
- Transfer hook enforcement working
- CLI + automation ready
- Test suite passing

---

## 🧠 Vision

fxckwhales aims to become a reusable primitive for:

- fair-launch tokens
- anti-manipulation systems
- DeFi governance protection
- token distribution control

---

## ⚠️ Disclaimer

This is experimental software. Use at your own risk.

---

## 👤 Author

Built by @fxckwhale002

