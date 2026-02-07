// ~/fxckwhales/client/create_mint_hook.js
require("dotenv").config();
const anchor = require("@coral-xyz/anchor");
const {
  Keypair,
  PublicKey,
  SystemProgram,
} = require("@solana/web3.js");

const {
  TOKEN_2022_PROGRAM_ID,
  ExtensionType,
  getMintLen,
  createInitializeMintInstruction,
  createInitializeTransferHookInstruction,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
} = require("@solana/spl-token");

// helper
function mustEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Falta ${name} en .env`);
  return v.trim();
}

(async () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const payer = provider.wallet.payer;
  const connection = provider.connection;

  const programId = new PublicKey(mustEnv("PROGRAM_ID"));
  const decimals = Number(process.env.MINT_DECIMALS ?? "9");

  console.log("RPC:", connection.rpcEndpoint);
  console.log("Payer:", payer.publicKey.toBase58());
  console.log("Hook Program:", programId.toBase58());

  // 1) create mint account with space for extensions
  const mintKeypair = Keypair.generate();
  const mint = mintKeypair.publicKey;

  const extensions = [ExtensionType.TransferHook];
  const mintLen = getMintLen(extensions);

  const lamports = await connection.getMinimumBalanceForRentExemption(mintLen);

  const tx = new anchor.web3.Transaction();

  tx.add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mint,
      lamports,
      space: mintLen,
      programId: TOKEN_2022_PROGRAM_ID,
    })
  );

  // 2) init transfer hook extension (points to your Anchor program)
  tx.add(
    createInitializeTransferHookInstruction(
      mint,
      payer.publicKey,      // authority that can update hook config later
      programId,            // your program id to be invoked as hook
      TOKEN_2022_PROGRAM_ID
    )
  );

  // 3) init mint
  tx.add(
    createInitializeMintInstruction(
      mint,
      decimals,
      payer.publicKey, // mint authority
      null,            // freeze authority (null = none)
      TOKEN_2022_PROGRAM_ID
    )
  );

  const sig = await provider.sendAndConfirm(tx, [mintKeypair]);
  console.log("✅ Mint+Hook creado:", mint.toBase58());
  console.log("Tx:", sig);

  // 4) create payer ATA and mint a small supply (optional but useful)
  const ata = getAssociatedTokenAddressSync(mint, payer.publicKey, false, TOKEN_2022_PROGRAM_ID);

  const tx2 = new anchor.web3.Transaction();
  tx2.add(
    createAssociatedTokenAccountInstruction(
      payer.publicKey,
      ata,
      payer.publicKey,
      mint,
      TOKEN_2022_PROGRAM_ID
    )
  );

  // mint 1_000 tokens (adjust if you want)
  tx2.add(
    createMintToInstruction(
      mint,
      ata,
      payer.publicKey,
      1000n * 10n ** BigInt(decimals),
      [],
      TOKEN_2022_PROGRAM_ID
    )
  );

  const sig2 = await provider.sendAndConfirm(tx2, []);
  console.log("✅ ATA creada y mint inicial hecho");
  console.log("ATA:", ata.toBase58());
  console.log("Tx2:", sig2);

  console.log("\n👉 Ahora pon esto en tu .env:");
  console.log(`MINT_ADDRESS=${mint.toBase58()}`);
})().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
