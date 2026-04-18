import * as anchor from "@coral-xyz/anchor";
import { Program, Idl } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
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

describe("fxckwhales-hook-real", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const programId = new PublicKey(
    "9716KNRKwaXaD9CkeqVjHCnDhuhBpWE1MwaDFPLabREE"
  );

  const program = new Program(idl as Idl, programId, provider);

  const authority = (provider.wallet as anchor.Wallet).payer;
  const senderOwner = Keypair.generate();
  const regularOwner = Keypair.generate();
  const reserveOwner = Keypair.generate();

  let mint: PublicKey;
  let configPda: PublicKey;
  let extraAccountMetaListPda: PublicKey;

  let senderTokenAccount: PublicKey;
  let regularTokenAccount: PublicKey;
  let reserveTokenAccount: PublicKey;

  before(async () => {
    for (const kp of [senderOwner, regularOwner, reserveOwner]) {
      const sig = await provider.connection.requestAirdrop(
        kp.publicKey,
        2 * anchor.web3.LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig, "confirmed");
    }

    const mintKeypair = Keypair.generate();
    mint = mintKeypair.publicKey;

    const mintLen = getMintLen([ExtensionType.TransferHook]);
    const lamports =
      await provider.connection.getMinimumBalanceForRentExemption(mintLen);

    [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config"), mint.toBuffer()],
      program.programId
    );

    [extraAccountMetaListPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("extra-account-metas"), mint.toBuffer()],
      program.programId
    );

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
        program.programId,
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

    senderTokenAccount = getAssociatedTokenAddressSync(
      mint,
      senderOwner.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    regularTokenAccount = getAssociatedTokenAddressSync(
      mint,
      regularOwner.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    reserveTokenAccount = getAssociatedTokenAddressSync(
      mint,
      reserveOwner.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

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
      )
    );

    await provider.sendAndConfirm(createAtasTx, []);

    // supply total = 10000
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

    // regular empieza en 0
    await program.methods
      .initializeConfig(100)
      .accounts({
        authority: authority.publicKey,
        mint,
        config: configPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([])
      .rpc();

    await program.methods
      .initializeExtraAccountMetaList()
      .accounts({
        authority: authority.publicKey,
        extraAccountMetaList: extraAccountMetaListPda,
        mint,
        config: configPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([])
      .rpc();

    console.log("ProgramId:", program.programId.toBase58());
    console.log("Mint:", mint.toBase58());
    console.log("Config PDA:", configPda.toBase58());
    console.log("ExtraAccountMetaList PDA:", extraAccountMetaListPda.toBase58());
    console.log("Sender token account:", senderTokenAccount.toBase58());
    console.log("Regular token account:", regularTokenAccount.toBase58());

    const senderInfo = await getAccount(
      provider.connection,
      senderTokenAccount,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    const regularInfo = await getAccount(
      provider.connection,
      regularTokenAccount,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    const reserveInfo = await getAccount(
      provider.connection,
      reserveTokenAccount,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );

    console.log("Sender initial amount:", senderInfo.amount.toString());
    console.log("Regular initial amount:", regularInfo.amount.toString());
    console.log("Reserve initial amount:", reserveInfo.amount.toString());
  });

  async function buildTransferIx(amount: bigint) {
    return await createTransferCheckedWithTransferHookInstruction(
      provider.connection,
      senderTokenAccount,
      mint,
      regularTokenAccount,
      senderOwner.publicKey,
      amount,
      0,
      [],
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
  }

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
    attempts = 20,
    delayMs = 250
  ): Promise<bigint> {
    let last = -1n;

    for (let i = 0; i < attempts; i++) {
      last = await getTokenAmount(account);
      if (last === expected) {
        return last;
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    return last;
  }

  it("real transfer allows destination below 1 percent", async () => {
    const before = await getTokenAmount(regularTokenAccount);
    console.log("Regular before test1:", before.toString());

    const ix = await buildTransferIx(50n);
    const tx = new Transaction().add(ix);
    await provider.sendAndConfirm(tx, [senderOwner]);

    const after = await waitForTokenAmount(regularTokenAccount, 50n);
    console.log("Regular after test1:", after.toString());

    if (after !== 50n) {
      throw new Error(`Expected regular balance 50, got ${after.toString()}`);
    }
  });

  it("real transfer blocks destination above 1 percent", async () => {
    const before = await getTokenAmount(regularTokenAccount);
    console.log("Regular before test2:", before.toString());

    try {
      const ix = await buildTransferIx(60n);
      const tx = new Transaction().add(ix);
      await provider.sendAndConfirm(tx, [senderOwner]);

      throw new Error("Expected MaxHoldExceeded");
    } catch (e: any) {
      const msg = (
        e?.error?.errorMessage ||
        e?.error?.message ||
        e?.message ||
        ""
      ).toString();

      console.log("caught msg:", msg);

      if (
        !msg.includes("MaxHoldExceeded") &&
        !msg.includes("Destination holding exceeds") &&
        !msg.includes("0x1773")
      ) {
        throw e;
      }
    }

    const after = await getTokenAmount(regularTokenAccount);
    console.log("Regular after test2:", after.toString());

    if (after !== 50n) {
      throw new Error(
        `Expected regular balance to remain 50 after blocked transfer, got ${after.toString()}`
      );
    }
  });
});
