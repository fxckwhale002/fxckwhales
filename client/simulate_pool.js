require("dotenv").config();

const anchor = require("@coral-xyz/anchor");
const { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } = require("@solana/web3.js");

const {
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  getMint,
  createTransferCheckedInstruction,
  createMintToCheckedInstruction,
} = require("@solana/spl-token");

// IDL generado por Anchor
const idl = require("../target/idl/fxckwhales.json");

function mustEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Falta ${name} en .env`);
  return v.trim();
}

function dumpErr(e) {
  console.error("❌ Transfer FAIL:", e?.message || e);

  if (e?.logs) {
    console.error("---- LOGS (e.logs) ----");
    console.error(e.logs.join("\n"));
  }

  if (typeof e?.getLogs === "function") {
    e.getLogs()
      .then((logs) => {
        console.error("---- LOGS (e.getLogs()) ----");
        console.error(logs.join("\n"));
      })
      .catch(() => {});
  }

  console.error("---- FULL ERROR OBJECT ----");
  console.error(e);
}

(async () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const connection = provider.connection;

  const programId = new PublicKey(mustEnv("PROGRAM_ID"));
  const mint = new PublicKey(mustEnv("MINT_ADDRESS"));
  const program = new anchor.Program(idl, programId, provider);

  console.log("ENV URL:", mustEnv("ANCHOR_PROVIDER_URL"));
  console.log("ENV WALLET:", mustEnv("ANCHOR_WALLET"));
  console.log("ENV PROGRAM_ID:", programId.toBase58());
  console.log("ENV MINT:", mint.toBase58());

  console.log("\n--- SETUP ---");
  const authority = provider.wallet.publicKey;

  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config"), mint.toBuffer()],
    program.programId
  );

  console.log("Authority (tu wallet):", authority.toBase58());
  console.log("Config PDA:", configPda.toBase58());
  console.log("Mint:", mint.toBase58());

  console.log("\n--- AIRDROPS ---");
  const pool = Keypair.generate();
  const buyer = Keypair.generate();

  await connection.requestAirdrop(pool.publicKey, 2 * LAMPORTS_PER_SOL);
  await connection.requestAirdrop(buyer.publicKey, 2 * LAMPORTS_PER_SOL);
  await new Promise((r) => setTimeout(r, 800));

  console.log("Airdrop OK:", pool.publicKey.toBase58());
  console.log("Airdrop OK:", buyer.publicKey.toBase58());

  console.log("\n--- MINT INFO ---");
  const mintInfo = await getMint(connection, mint, "confirmed", TOKEN_2022_PROGRAM_ID);
  const decimals = mintInfo.decimals;

  console.log("Decimals:", decimals);
  console.log("Supply (raw):", mintInfo.supply.toString());
  console.log("Mint authority:", mintInfo.mintAuthority?.toBase58() || "(none)");

  console.log("\n--- CREATE ATAs ---");

  const payerPk = provider.wallet.publicKey;

  const poolAta = getAssociatedTokenAddressSync(
    mint,
    pool.publicKey,
    true,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const buyerAta = getAssociatedTokenAddressSync(
    mint,
    buyer.publicKey,
    true,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const createAtasTx = new anchor.web3.Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(
      payerPk,
      poolAta,
      pool.publicKey,
      mint,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    ),
    createAssociatedTokenAccountIdempotentInstruction(
      payerPk,
      buyerAta,
      buyer.publicKey,
      mint,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    )
  );

  const createAtaSig = await provider.sendAndConfirm(createAtasTx, [], {
    commitment: "confirmed",
    skipPreflight: false,
  });

  console.log("ATAs created/ok. Tx:", createAtaSig);
  console.log("POOL ATA:", poolAta.toBase58());
  console.log("BUYER ATA:", buyerAta.toBase58());

  console.log("\n--- INIT CONFIG (si falta) ---");
  let cfgExists = true;
  try {
    await program.account.config.fetch(configPda);
  } catch {
    cfgExists = false;
  }

  if (!cfgExists) {
    const maxHoldBps = 100; // 1%
    const txInit = await program.methods
      .initializeConfig(maxHoldBps)
      .accounts({
        config: configPda,
        mint,
        authority,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("✅ Config inicializado. Tx:", txInit);
  } else {
    console.log("ℹ️ Config ya existe, seguimos.");
  }

  console.log("\n--- WHITELIST POOL (LiquidityPool) ---");
  const [wlEntryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("whitelist"), configPda.toBuffer(), pool.publicKey.toBuffer()],
    program.programId
  );

  const kind = { liquidityPool: {} };

  const txWl = await program.methods
    .addWhitelist(kind)
    .accounts({
      config: configPda,
      wallet: pool.publicKey,
      entry: wlEntryPda,
      authority,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log("Pool whitelisted ✅ Tx:", txWl);
  console.log("Whitelist entry PDA:", wlEntryPda.toBase58());

  console.log("\n--- FUND POOL WITH TOKENS ---");
  const amountToPool = 1_000_000n * 10n ** BigInt(decimals);

  const ixMint = createMintToCheckedInstruction(
    mint,
    poolAta,
    authority,
    amountToPool,
    decimals,
    [],
    TOKEN_2022_PROGRAM_ID
  );

  const txMint = new anchor.web3.Transaction().add(ixMint);
  const sigMint = await provider.sendAndConfirm(txMint, [], { commitment: "confirmed" });
  console.log("Minted to pool ✅ Tx:", sigMint);
    // PDA que Token-2022 necesita para Transfer Hook
  const [extraAccountMetaListPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("extra-account-metas"), mint.toBuffer()],
    program.programId
  );

  console.log("ExtraAccountMetaList PDA:", extraAccountMetaListPda.toBase58());

  console.log("\n--- SIMULATE BUY ---");
  const mintInfo2 = await getMint(connection, mint, "confirmed", TOKEN_2022_PROGRAM_ID);
  const totalSupply = BigInt(mintInfo2.supply.toString());

  const tooBig = totalSupply / 50n;  // 2%
  const safe = totalSupply / 200n;   // 0.5%

  console.log("Total supply:", totalSupply.toString());
  console.log("Try TOO BIG (2%):", tooBig.toString());
  console.log("Try SAFE (0.5%):", safe.toString());

  // ✅ Transfer Token-2022 + Transfer Hook extras (IMPORTANT)
    async function token2022Transfer(fromAta, toAta, ownerKp, amount) {
    const ix = createTransferCheckedInstruction(
      fromAta,
      mint,
      toAta,
      ownerKp.publicKey,
      amount, // bigint OK
      decimals,
      [],
      TOKEN_2022_PROGRAM_ID
    );

    // ✅ ORDEN IMPORTANTE (según Transfer Hook interface):
    // 1) ExtraAccountMetaList PDA
    ix.keys.push({
      pubkey: extraAccountMetaListPda,
      isSigner: false,
      isWritable: false,
    });

    // 2) Extra accounts que tu hook necesita (en tu caso, configPda)
    ix.keys.push({
      pubkey: configPda,
      isSigner: false,
      isWritable: false,
    });

    const tx = new anchor.web3.Transaction().add(ix);

    return await provider.sendAndConfirm(tx, [ownerKp], {
      commitment: "confirmed",
      skipPreflight: false,
    });
  }


  // Intento grande (debe fallar)
  try {
    const sig = await token2022Transfer(poolAta, buyerAta, pool, tooBig);
    console.log("❌ OJO: transfer grande PASÓ (no se esperaba). Tx:", sig);
  } catch (e) {
    console.log("✅ Transfer grande BLOQUEADA (bien).");
    dumpErr(e);
  }

  // Intento safe (debe pasar)
  try {
    const sig = await token2022Transfer(poolAta, buyerAta, pool, safe);
    console.log("✅ Transfer pequeña OK. Tx:", sig);
  } catch (e) {
    console.log("❌ Transfer pequeña falló (revisar hook/config).");
    dumpErr(e);
  }

  console.log("\n--- DONE ---");
  console.log("POOL:", pool.publicKey.toBase58());
  console.log("BUYER:", buyer.publicKey.toBase58());
  console.log("POOL ATA:", poolAta.toBase58());
  console.log("BUYER ATA:", buyerAta.toBase58());
})();
