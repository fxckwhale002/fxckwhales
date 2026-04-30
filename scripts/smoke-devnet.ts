import * as anchor from "@coral-xyz/anchor";
import { Program, Idl } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  ExtensionType,
  createInitializeMintInstruction,
  createInitializeTransferHookInstruction,
  getMintLen,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  mintTo,
  getAccount,
  createTransferCheckedWithTransferHookInstruction,
} from "@solana/spl-token";

const idl = require("../target/idl/fxckwhales.json");

const PROGRAM_ID = new PublicKey("9716KNRKwaXaD9CkeqVjHCnDhuhBpWE1MwaDFPLabREE");

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureHookProgramMeta(ix: TransactionInstruction) {
  const hasHookProgram = ix.keys.some((meta) => meta.pubkey.equals(PROGRAM_ID));

  if (!hasHookProgram) {
    ix.keys.push({
      pubkey: PROGRAM_ID,
      isSigner: false,
      isWritable: false,
    });
  }

  return ix;
}

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = new Program(idl as Idl, PROGRAM_ID, provider);
  const authority = (provider.wallet as anchor.Wallet).payer;

  const balance = await provider.connection.getBalance(authority.publicKey);
  console.log("Authority:", authority.publicKey.toBase58());
  console.log("Balance SOL:", balance / anchor.web3.LAMPORTS_PER_SOL);

  const programInfo = await provider.connection.getAccountInfo(PROGRAM_ID);
  if (!programInfo?.executable) {
    throw new Error(`Hook program is not executable on this cluster: ${PROGRAM_ID.toBase58()}`);
  }

  const senderOwner = Keypair.generate();
  const regularOwner = Keypair.generate();
  const reserveOwner = Keypair.generate();
  const whitelistedOwner = Keypair.generate();

  const mintKeypair = Keypair.generate();
  const mint = mintKeypair.publicKey;

  const mintLen = getMintLen([ExtensionType.TransferHook]);
  const lamports =
    await provider.connection.getMinimumBalanceForRentExemption(mintLen);

  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config"), mint.toBuffer()],
    PROGRAM_ID
  );

  const [extraAccountMetaListPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("extra-account-metas"), mint.toBuffer()],
    PROGRAM_ID
  );

  const senderTokenAccount = getAssociatedTokenAddressSync(
    mint,
    senderOwner.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID
  );

  const regularTokenAccount = getAssociatedTokenAddressSync(
    mint,
    regularOwner.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID
  );

  const reserveTokenAccount = getAssociatedTokenAddressSync(
    mint,
    reserveOwner.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID
  );

  const whitelistedTokenAccount = getAssociatedTokenAddressSync(
    mint,
    whitelistedOwner.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID
  );

  const [whitelistPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("whitelist"),
      configPda.toBuffer(),
      whitelistedTokenAccount.toBuffer(),
    ],
    PROGRAM_ID
  );

  console.log("Program:", PROGRAM_ID.toBase58());
  console.log("Mint:", mint.toBase58());
  console.log("Config PDA:", configPda.toBase58());
  console.log("ExtraAccountMetaList PDA:", extraAccountMetaListPda.toBase58());
  console.log("Sender token account:", senderTokenAccount.toBase58());
  console.log("Regular token account:", regularTokenAccount.toBase58());
  console.log("Whitelisted token account:", whitelistedTokenAccount.toBase58());
  console.log("Whitelist PDA:", whitelistPda.toBase58());

  console.log("\n1) Creating Token-2022 mint with transfer hook...");

  const createMintTx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: authority.publicKey,
      newAccountPubkey: mint,
      space: mintLen,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeTransferHookInstruction(
      mint,
      authority.publicKey,
      PROGRAM_ID,
      TOKEN_2022_PROGRAM_ID
    ),
    createInitializeMintInstruction(
      mint,
      0,
      authority.publicKey,
      null,
      TOKEN_2022_PROGRAM_ID
    )
  );

  await provider.sendAndConfirm(createMintTx, [mintKeypair]);
  console.log("✅ Mint created");

  console.log("\n2) Creating token accounts...");

  const createAtasTx = new Transaction().add(
    createAssociatedTokenAccountInstruction(
      authority.publicKey,
      senderTokenAccount,
      senderOwner.publicKey,
      mint,
      TOKEN_2022_PROGRAM_ID
    ),
    createAssociatedTokenAccountInstruction(
      authority.publicKey,
      regularTokenAccount,
      regularOwner.publicKey,
      mint,
      TOKEN_2022_PROGRAM_ID
    ),
    createAssociatedTokenAccountInstruction(
      authority.publicKey,
      reserveTokenAccount,
      reserveOwner.publicKey,
      mint,
      TOKEN_2022_PROGRAM_ID
    ),
    createAssociatedTokenAccountInstruction(
      authority.publicKey,
      whitelistedTokenAccount,
      whitelistedOwner.publicKey,
      mint,
      TOKEN_2022_PROGRAM_ID
    )
  );

  await provider.sendAndConfirm(createAtasTx, []);
  console.log("✅ Token accounts created");

  console.log("\n3) Minting supply total = 10000...");

  await mintTo(
    provider.connection,
    authority,
    mint,
    senderTokenAccount,
    authority,
    1000,
    [],
    undefined,
    TOKEN_2022_PROGRAM_ID
  );

  await mintTo(
    provider.connection,
    authority,
    mint,
    reserveTokenAccount,
    authority,
    9000,
    [],
    undefined,
    TOKEN_2022_PROGRAM_ID
  );

  console.log("✅ Supply minted");

  console.log("\n4) Initializing config max_hold_bps = 100...");

  await program.methods
    .initializeConfig(100)
    .accounts({
      authority: authority.publicKey,
      mint,
      config: configPda,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log("✅ Config initialized");

  console.log("\n5) Initializing ExtraAccountMetaList...");

  await program.methods
    .initializeExtraAccountMetaList()
    .accounts({
      authority: authority.publicKey,
      extraAccountMetaList: extraAccountMetaListPda,
      mint,
      config: configPda,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log("✅ ExtraAccountMetaList initialized");

  console.log("Waiting for devnet propagation...");
  await sleep(3000);

  async function getTokenAmount(account: PublicKey): Promise<bigint> {
    const info = await getAccount(
      provider.connection,
      account,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    return info.amount;
  }

  async function waitForTokenAmount(
    account: PublicKey,
    expected: bigint,
    attempts = 30,
    delayMs = 1000
  ): Promise<bigint> {
    let last = BigInt(-1);

    for (let i = 0; i < attempts; i++) {
      last = await getTokenAmount(account);

      if (last === expected) {
        return last;
      }

      await sleep(delayMs);
    }

    return last;
  }

  async function buildTransferIx(destination: PublicKey, amount: bigint) {
    const ix = await createTransferCheckedWithTransferHookInstruction(
      provider.connection,
      senderTokenAccount,
      mint,
      destination,
      senderOwner.publicKey,
      amount,
      0,
      [],
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );

    ensureHookProgramMeta(ix);

    console.log(
      "Transfer ix accounts:",
      ix.keys.map((k) => k.pubkey.toBase58())
    );

    return ix;
  }

  async function sendTransfer(destination: PublicKey, amount: bigint) {
    const ix = await buildTransferIx(destination, amount);
    const tx = new Transaction().add(ix);
    await provider.sendAndConfirm(tx, [senderOwner]);
  }

  async function expectTransferToFail(destination: PublicKey, amount: bigint) {
    try {
      await sendTransfer(destination, amount);
      throw new Error("Expected transfer to fail");
    } catch (e: any) {
      const msg = (
        e?.error?.errorMessage ||
        e?.error?.message ||
        e?.message ||
        ""
      ).toString();

      console.log("Caught expected failure:", msg);

      if (
        !msg.includes("MaxHoldExceeded") &&
        !msg.includes("Destination holding exceeds") &&
        !msg.includes("0x1773")
      ) {
        throw e;
      }
    }
  }

  console.log("\n6) Transfer below 1% should pass...");

  await sendTransfer(regularTokenAccount, BigInt(50));
  const regularAfterSmall = await waitForTokenAmount(regularTokenAccount, BigInt(50));

  if (regularAfterSmall !== BigInt(50)) {
    throw new Error(
      `Expected regular balance 50, got ${regularAfterSmall.toString()}`
    );
  }

  console.log("✅ Below-limit transfer passed");

  console.log("\n7) Transfer above 1% should fail...");

  await expectTransferToFail(regularTokenAccount, BigInt(60));
  const regularAfterBlocked = await getTokenAmount(regularTokenAccount);

  if (regularAfterBlocked !== BigInt(50)) {
    throw new Error(
      `Expected regular balance to remain 50, got ${regularAfterBlocked.toString()}`
    );
  }

  console.log("✅ Above-limit transfer blocked");

  console.log("\n8) Adding whitelist entry...");

  await program.methods
    .addWhitelist({ liquidityPool: {} })
    .accounts({
      config: configPda,
      wallet: whitelistedTokenAccount,
      entry: whitelistPda,
      authority: authority.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log("✅ Whitelist added");

  console.log("\n9) Whitelisted destination should bypass limit...");

  await sendTransfer(whitelistedTokenAccount, BigInt(500));
  const whitelistedAfter = await waitForTokenAmount(whitelistedTokenAccount, BigInt(500));

  if (whitelistedAfter !== BigInt(500)) {
    throw new Error(
      `Expected whitelisted balance 500, got ${whitelistedAfter.toString()}`
    );
  }

  console.log("✅ Whitelisted transfer passed");

  console.log("\n10) Removing whitelist entry...");

  await program.methods
    .removeWhitelist()
    .accounts({
      config: configPda,
      wallet: whitelistedTokenAccount,
      entry: whitelistPda,
      authority: authority.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  const whitelistInfo = await provider.connection.getAccountInfo(whitelistPda);

  if (whitelistInfo !== null) {
    throw new Error("Expected whitelist PDA to be closed");
  }

  console.log("✅ Whitelist removed and PDA closed");

  console.log("\n11) Destination should be blocked again after remove...");

  await expectTransferToFail(whitelistedTokenAccount, BigInt(1));
  const whitelistedAfterBlocked = await getTokenAmount(whitelistedTokenAccount);

  if (whitelistedAfterBlocked !== BigInt(500)) {
    throw new Error(
      `Expected whitelisted balance to remain 500, got ${whitelistedAfterBlocked.toString()}`
    );
  }

  console.log("✅ Transfer blocked again after whitelist removal");

  console.log("\n🎉 DEVNET SMOKE TEST PASSED");
  console.log("Mint:", mint.toBase58());
  console.log("Config PDA:", configPda.toBase58());
  console.log("ExtraAccountMetaList PDA:", extraAccountMetaListPda.toBase58());
}

main().catch((err) => {
  console.error("❌ DEVNET SMOKE TEST FAILED");
  console.error(err);
  process.exit(1);
});
