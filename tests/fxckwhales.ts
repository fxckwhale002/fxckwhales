import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorError, Idl } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  createMint,
} from "@solana/spl-token";

const idl = require("../target/idl/fxckwhales.json");

describe("fxckwhales", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const programId = new PublicKey(
    "9716KNRKwaXaD9CkeqVjHCnDhuhBpWE1MwaDFPLabREE"
  );

  const program = new Program(idl as Idl, programId, provider);

  const authority = (provider.wallet as anchor.Wallet).payer;
  const outsider = Keypair.generate();
  const walletToWhitelist = Keypair.generate();

  let mint: PublicKey;
  let configPda: PublicKey;
  let whitelistPda: PublicKey;

  before(async () => {
    for (const kp of [outsider, walletToWhitelist]) {
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
      9,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config"), mint.toBuffer()],
      program.programId
    );

    [whitelistPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("whitelist"),
        configPda.toBuffer(),
        walletToWhitelist.publicKey.toBuffer(),
      ],
      program.programId
    );

    console.log("ProgramId:", program.programId.toBase58());
    console.log("Mint:", mint.toBase58());
    console.log("Config PDA:", configPda.toBase58());
  });

  it("initialize_config", async () => {
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

    const cfg = await program.account.config.fetch(configPda);
    expectPk(cfg.mint, mint);
    expectNum(cfg.maxHoldBps, 100);
    expectAuthoritySome(cfg.authority, authority.publicKey);
  });

  it("fails with invalid bps (0)", async () => {
    const badMint = await createMint(
      provider.connection,
      authority,
      authority.publicKey,
      null,
      9,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    const [badConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config"), badMint.toBuffer()],
      program.programId
    );

    try {
      await program.methods
        .initializeConfig(0)
        .accounts({
          authority: authority.publicKey,
          mint: badMint,
          config: badConfigPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      throw new Error("Expected InvalidBps");
    } catch (e: any) {
      const code = anchorErrorCode(e);
      const msg = anchorErrorMsg(e);
      console.log("caught error code:", code);
      console.log("caught error msg:", msg);

      if (code !== "InvalidBps" && !msg.includes("InvalidBps")) {
        throw e;
      }
    }
  });

  it("add_whitelist (LiquidityPool)", async () => {
    await program.methods
      .addWhitelist({ liquidityPool: {} })
      .accounts({
        authority: authority.publicKey,
        config: configPda,
        wallet: walletToWhitelist.publicKey,
        entry: whitelistPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([])
      .rpc();

    const entry = await program.account.whitelistEntry.fetch(whitelistPda);
    expectPk(entry.config, configPda);
    expectPk(entry.wallet, walletToWhitelist.publicKey);
  });

  it("add_whitelist fails if not authority (Unauthorized)", async () => {
    const [outsiderEntryPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("whitelist"),
        configPda.toBuffer(),
        outsider.publicKey.toBuffer(),
      ],
      program.programId
    );

    try {
      await program.methods
        .addWhitelist({ liquidityPool: {} })
        .accounts({
          authority: outsider.publicKey,
          config: configPda,
          wallet: outsider.publicKey,
          entry: outsiderEntryPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([outsider])
        .rpc();

      throw new Error("Expected Unauthorized");
    } catch (e: any) {
      const code = anchorErrorCode(e);
      const msg = anchorErrorMsg(e);
      console.log("caught code:", code);
      console.log("caught msg:", msg);

      if (code !== "Unauthorized" && !msg.includes("Unauthorized")) {
        throw e;
      }
    }
  });

  it("remove_whitelist", async () => {
    await program.methods
      .removeWhitelist()
      .accounts({
        authority: authority.publicKey,
        config: configPda,
        wallet: walletToWhitelist.publicKey,
        entry: whitelistPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([])
      .rpc();

    const entryInfo = await provider.connection.getAccountInfo(whitelistPda);
    if (entryInfo !== null) {
      throw new Error("Whitelist entry still exists after remove_whitelist");
    }
  });

  it("finalize_config freezes and blocks add_whitelist (ConfigFrozen)", async () => {
    await program.methods
      .finalizeConfig()
      .accounts({
        authority: authority.publicKey,
        config: configPda,
      })
      .signers([])
      .rpc();

    const cfg = await program.account.config.fetch(configPda);

    if (!isAuthorityNone(cfg.authority)) {
      throw new Error("Config authority should be None after finalizeConfig");
    }

    const [newEntryPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("whitelist"),
        configPda.toBuffer(),
        outsider.publicKey.toBuffer(),
      ],
      program.programId
    );

    try {
      await program.methods
        .addWhitelist({ liquidityPool: {} })
        .accounts({
          authority: authority.publicKey,
          config: configPda,
          wallet: outsider.publicKey,
          entry: newEntryPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([])
        .rpc();

      throw new Error("Expected ConfigFrozen");
    } catch (e: any) {
      const code = anchorErrorCode(e);
      const msg = anchorErrorMsg(e);
      console.log("caught code:", code);
      console.log("caught msg:", msg);

      if (code !== "ConfigFrozen" && !msg.includes("ConfigFrozen")) {
        throw e;
      }
    }
  });
});

function anchorErrorCode(e: any): string {
  return (
    e?.error?.errorCode?.code ||
    e?.errorCode?.code ||
    ""
  ).toString();
}

function anchorErrorMsg(e: any): string {
  return (
    e?.error?.errorMessage ||
    e?.error?.message ||
    e?.message ||
    ""
  ).toString();
}

function expectPk(a: any, b: PublicKey) {
  const aPk = new PublicKey(a);
  if (!aPk.equals(b)) {
    throw new Error(`Pubkey mismatch: ${aPk.toBase58()} != ${b.toBase58()}`);
  }
}

function expectNum(v: any, expected: number) {
  const n = typeof v?.toNumber === "function" ? v.toNumber() : Number(v);
  if (n !== expected) {
    throw new Error(`Number mismatch: ${n} != ${expected}`);
  }
}

function isAuthorityNone(authorityField: any): boolean {
  if (authorityField == null) return true;
  if (typeof authorityField === "object") {
    if ("none" in authorityField) return true;
    if ("some" in authorityField) return false;
  }
  return false;
}

function expectAuthoritySome(authorityField: any, expected: PublicKey) {
  if (authorityField == null) {
    throw new Error("authority is null/none");
  }

  let pk: PublicKey | null = null;

  if (authorityField instanceof PublicKey) {
    pk = authorityField;
  } else if (typeof authorityField === "object" && "some" in authorityField) {
    pk = new PublicKey(authorityField.some);
  } else {
    try {
      pk = new PublicKey(authorityField);
    } catch {
      pk = null;
    }
  }

  if (!pk || !pk.equals(expected)) {
    throw new Error(
      `Authority mismatch: got ${pk?.toBase58?.() ?? authorityField}, expected ${expected.toBase58()}`
    );
  }
}
