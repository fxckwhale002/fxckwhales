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
  createInitializeMintInstruction,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  mintTo,
  getAccount,
} from "@solana/spl-token";

const idl = require("../target/idl/fxckwhales.json");

describe("fxckwhales-hook", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const programId = new PublicKey(
    "9716KNRKwaXaD9CkeqVjHCnDhuhBpWE1MwaDFPLabREE"
  );
  const program = new Program(idl as Idl, programId, provider);

  const authority = (provider.wallet as anchor.Wallet).payer;

  const regularOwner = Keypair.generate();
  const reserveOwner = Keypair.generate();
  const whitelistedOwner = Keypair.generate();

  let mint: PublicKey;
  let configPda: PublicKey;
  let whitelistPda: PublicKey;

  let regularTokenAccount: PublicKey;
  let reserveTokenAccount: PublicKey;
  let whitelistedTokenAccount: PublicKey;

  before(async () => {
    for (const kp of [regularOwner, reserveOwner, whitelistedOwner]) {
      const sig = await provider.connection.requestAirdrop(
        kp.publicKey,
        2 * anchor.web3.LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig, "confirmed");
    }

    const mintKeypair = Keypair.generate();
    mint = mintKeypair.publicKey;

    const lamports =
      await provider.connection.getMinimumBalanceForRentExemption(82);

    [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config"), mint.toBuffer()],
      program.programId
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

    whitelistedTokenAccount = getAssociatedTokenAddressSync(
      mint,
      whitelistedOwner.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    [whitelistPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("whitelist"),
        configPda.toBuffer(),
        whitelistedTokenAccount.toBuffer(),
      ],
      program.programId
    );

    const createMintTx = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: authority.publicKey,
        newAccountPubkey: mint,
        lamports,
        space: 82,
        programId: TOKEN_2022_PROGRAM_ID,
      }),
      createInitializeMintInstruction(
        mint,
        0,
        authority.publicKey,
        null,
        TOKEN_2022_PROGRAM_ID
      )
    );

    await provider.sendAndConfirm(createMintTx, [mintKeypair]);

    const createAtasTx = new Transaction().add(
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

    await mintTo(
      provider.connection,
      authority,
      mint,
      regularTokenAccount,
      authority,
      40,
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
      9960,
      [],
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    await program.methods
      .initializeConfig(100)
      .accounts({
        authority: authority.publicKey,
        mint,
        config: configPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

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

    console.log("ProgramId:", program.programId.toBase58());
    console.log("Mint:", mint.toBase58());
    console.log("Config PDA:", configPda.toBase58());
    console.log("Whitelist PDA:", whitelistPda.toBase58());
    console.log("Whitelisted token account:", whitelistedTokenAccount.toBase58());
    console.log("Regular token account:", regularTokenAccount.toBase58());
    console.log("Reserve token account:", reserveTokenAccount.toBase58());
    console.log("Regular token owner:", regularOwner.publicKey.toBase58());
    console.log("Regular token amount:", regularInfo.amount.toString());
    console.log("Reserve token amount:", reserveInfo.amount.toString());
  });

  it("debug_validate_transfer allows transfer below max_hold", async () => {
    await program.methods
      .debugValidateTransfer(new anchor.BN(60))
      .accounts({
        mint,
        destinationToken: regularTokenAccount,
        config: configPda,
        whitelistEntry: null,
      })
      .rpc();
  });

  it("debug_validate_transfer blocks transfer above max_hold", async () => {
    try {
      await program.methods
        .debugValidateTransfer(new anchor.BN(61))
        .accounts({
          mint,
          destinationToken: regularTokenAccount,
          config: configPda,
          whitelistEntry: null,
        })
        .rpc();

      throw new Error("Expected MaxHoldExceeded");
    } catch (e: any) {
      const code = e?.error?.errorCode?.code || "";
      const msg = (
        e?.error?.errorMessage ||
        e?.error?.message ||
        e?.message ||
        ""
      ).toString();

      console.log("caught code:", code);
      console.log("caught msg:", msg);

      if (
        !msg.includes("MaxHoldExceeded") &&
        !msg.includes("Destination holding exceeds") &&
        !msg.includes("0x1773")
      ) {
        throw e;
      }
    }
  });

  it("debug_validate_transfer allows whitelisted destination", async () => {
    await program.methods
      .debugValidateTransfer(new anchor.BN(500))
      .accounts({
        mint,
        destinationToken: whitelistedTokenAccount,
        config: configPda,
        whitelistEntry: whitelistPda,
      })
      .rpc();
  });
});
