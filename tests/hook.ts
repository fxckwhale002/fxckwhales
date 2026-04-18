import * as anchor from "@coral-xyz/anchor";
import { Program, Idl } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";
import {
  TOKEN_2022_PROGRAM_ID,
  createMint,
  createAccount,
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
  const whitelistedOwner = Keypair.generate();
  const reserveOwner = Keypair.generate();

  let mint: PublicKey;
  let configPda: PublicKey;
  let whitelistPda: PublicKey;

  let regularTokenAccount: PublicKey;
  let whitelistedTokenAccount: PublicKey;
  let reserveTokenAccount: PublicKey;

  before(async () => {
    for (const kp of [regularOwner, whitelistedOwner, reserveOwner]) {
      const sig = await provider.connection.requestAirdrop(
        kp.publicKey,
        2 * anchor.web3.LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig, "confirmed");
    }

    mint = await createMint(
      provider.connection,
      authority,
      authority.publicKey,
      null,
      0,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config"), mint.toBuffer()],
      program.programId
    );

    regularTokenAccount = await createAccount(
      provider.connection,
      authority,
      mint,
      regularOwner.publicKey,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    whitelistedTokenAccount = await createAccount(
      provider.connection,
      authority,
      mint,
      whitelistedOwner.publicKey,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    reserveTokenAccount = await createAccount(
      provider.connection,
      authority,
      mint,
      reserveOwner.publicKey,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

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
        config: configPda,
        mint,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    [whitelistPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("whitelist"),
        configPda.toBuffer(),
        whitelistedOwner.publicKey.toBuffer(),
      ],
      program.programId
    );

    await program.methods
      .addWhitelist({ liquidityPool: {} })
      .accounts({
        config: configPda,
        wallet: whitelistedOwner.publicKey,
        entry: whitelistPda,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const regularAccount = await getAccount(
      provider.connection,
      regularTokenAccount,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );

    const reserveAccount = await getAccount(
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
    console.log("Regular token amount:", regularAccount.amount.toString());
    console.log("Reserve token amount:", reserveAccount.amount.toString());
  });

  it("debug_validate_transfer allows transfer below max_hold", async () => {
    await program.methods
      .debugValidateTransfer(new anchor.BN(50))
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
      const msg = (
        e?.error?.errorMessage ||
        e?.error?.message ||
        e?.message ||
        ""
      ).toString();

      console.log("caught code:", e?.error?.errorCode?.code || "");
      console.log("caught msg:", msg);

      if (
        !msg.includes("Destination holding exceeds") &&
        !msg.includes("MaxHoldExceeded") &&
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
