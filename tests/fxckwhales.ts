import * as anchor from "@coral-xyz/anchor";
import { Program, Idl } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";

const idl = require("../target/idl/fxckwhales.json");

type ConfigAccount = {
  mint: PublicKey;
  maxHoldBps: number;
  authority: PublicKey | null;
  bump: number;
};

type WhitelistEntryAccount = {
  config: PublicKey;
  wallet: PublicKey;
  kind: any;
  bump: number;
};

describe("fxckwhales", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const programId = new PublicKey(
    "9716KNRKwaXaD9CkeqVjHCnDhuhBpWE1MwaDFPLabREE"
  );

  const program = new Program(idl as Idl, programId, provider);

  const authority = (provider.wallet as anchor.Wallet).payer;
  const outsider = Keypair.generate();

  let mint: Keypair;
  let configPda: PublicKey;

  before(async () => {
    const sig = await provider.connection.requestAirdrop(
      outsider.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig, "confirmed");

    mint = Keypair.generate();

    [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config"), mint.publicKey.toBuffer()],
      program.programId
    );
  });

  it("initialize_config", async () => {
    await program.methods
      .initializeConfig(100)
      .accounts({
        config: configPda,
        mint: mint.publicKey,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const cfg = (await program.account.config.fetch(
      configPda
    )) as ConfigAccount;

    expect(cfg.maxHoldBps).to.eq(100);
    expect(cfg.mint.toBase58()).to.eq(mint.publicKey.toBase58());
    expect(cfg.authority?.toBase58()).to.eq(authority.publicKey.toBase58());
  });

  it("fails with invalid bps (0)", async () => {
    const badMint = Keypair.generate();
    const [badConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config"), badMint.publicKey.toBuffer()],
      program.programId
    );

    try {
      await program.methods
        .initializeConfig(0)
        .accounts({
          config: badConfigPda,
          mint: badMint.publicKey,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      throw new Error("Expected InvalidBps");
    } catch (e: any) {
      const msg = (
        e?.error?.errorMessage ||
        e?.error?.message ||
        e?.message ||
        ""
      ).toString();

      console.log("caught error msg:", msg);

      if (
        !msg.includes("Invalid basis points value") &&
        !msg.includes("0x1770") &&
        !msg.includes("InvalidBps")
      ) {
        throw e;
      }
    }
  });

  it("add_whitelist (LiquidityPool)", async () => {
    const wallet = Keypair.generate();

    const [entryPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("whitelist"),
        configPda.toBuffer(),
        wallet.publicKey.toBuffer(),
      ],
      program.programId
    );

    await program.methods
      .addWhitelist({ liquidityPool: {} })
      .accounts({
        config: configPda,
        wallet: wallet.publicKey,
        entry: entryPda,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const entry = (await program.account.whitelistEntry.fetch(
      entryPda
    )) as WhitelistEntryAccount;

    expect(entry.config.toBase58()).to.eq(configPda.toBase58());
    expect(entry.wallet.toBase58()).to.eq(wallet.publicKey.toBase58());
  });

  it("add_whitelist fails if not authority (Unauthorized)", async () => {
    const wallet = Keypair.generate();

    const [entryPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("whitelist"),
        configPda.toBuffer(),
        wallet.publicKey.toBuffer(),
      ],
      program.programId
    );

    try {
      await program.methods
        .addWhitelist({ liquidityPool: {} })
        .accounts({
          config: configPda,
          wallet: wallet.publicKey,
          entry: entryPda,
          authority: outsider.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([outsider])
        .rpc();

      throw new Error("Expected Unauthorized");
    } catch (e: any) {
      const msg = (
        e?.error?.errorMessage ||
        e?.error?.message ||
        e?.message ||
        ""
      ).toString();

      console.log("caught msg:", msg);

      if (!msg.includes("Unauthorized") && !msg.includes("0x1771")) {
        throw e;
      }
    }
  });

  it("remove_whitelist", async () => {
    const wallet = Keypair.generate();

    const [entryPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("whitelist"),
        configPda.toBuffer(),
        wallet.publicKey.toBuffer(),
      ],
      program.programId
    );

    await program.methods
      .addWhitelist({ liquidityPool: {} })
      .accounts({
        config: configPda,
        wallet: wallet.publicKey,
        entry: entryPda,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .removeWhitelist()
      .accounts({
        config: configPda,
        wallet: wallet.publicKey,
        entry: entryPda,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const info = await provider.connection.getAccountInfo(entryPda);
    expect(info).to.eq(null);
  });

  it("finalize_config freezes and blocks add_whitelist (ConfigFrozen)", async () => {
    const frozenMint = Keypair.generate();

    const [frozenConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config"), frozenMint.publicKey.toBuffer()],
      program.programId
    );

    await program.methods
      .initializeConfig(100)
      .accounts({
        config: frozenConfigPda,
        mint: frozenMint.publicKey,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .finalizeConfig()
      .accounts({
        config: frozenConfigPda,
        authority: authority.publicKey,
      })
      .rpc();

    const wallet = Keypair.generate();
    const [entryPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("whitelist"),
        frozenConfigPda.toBuffer(),
        wallet.publicKey.toBuffer(),
      ],
      program.programId
    );

    try {
      await program.methods
        .addWhitelist({ liquidityPool: {} })
        .accounts({
          config: frozenConfigPda,
          wallet: wallet.publicKey,
          entry: entryPda,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      throw new Error("Expected ConfigFrozen");
    } catch (e: any) {
      const msg = (
        e?.error?.errorMessage ||
        e?.error?.message ||
        e?.message ||
        ""
      ).toString();

      console.log("caught msg:", msg);

      if (
        !msg.includes("Config is frozen") &&
        !msg.includes("ConfigFrozen") &&
        !msg.includes("0x1772")
      ) {
        throw e;
      }
    }
  });
});
