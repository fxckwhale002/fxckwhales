import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import fs from "fs";
import os from "os";
import path from "path";

const PROGRAM_ID = new PublicKey("9716KNRKwaXaD9CkeqVjHCnDhuhBpWE1MwaDFPLabREE");

function expandHome(filePath: string): string {
  if (filePath.startsWith("~/")) {
    return path.join(os.homedir(), filePath.slice(2));
  }
  return filePath;
}

export function loadKeypair(keypairPath: string): Keypair {
  const resolvedPath = expandHome(keypairPath);
  const secret = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

export function getProgram() {
  const url = process.env.ANCHOR_PROVIDER_URL || "https://api.devnet.solana.com";
  const walletPath =
    process.env.ANCHOR_WALLET || path.join(os.homedir(), ".config/solana/id.json");

  const connection = new Connection(url, "confirmed");
  const payer = loadKeypair(walletPath);
  const wallet = new anchor.Wallet(payer);

  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });

  anchor.setProvider(provider);

  const idlPath = path.resolve(process.cwd(), "target/idl/fxckwhales.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));

  const program = new anchor.Program(idl, PROGRAM_ID, provider);

  return {
    program,
    provider,
    payer,
    programId: PROGRAM_ID,
  };
}

export function deriveConfigPda(programId: PublicKey, mint: PublicKey): PublicKey {
  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config"), mint.toBuffer()],
    programId
  );

  return configPda;
}

export function deriveWhitelistPda(
  programId: PublicKey,
  config: PublicKey,
  wallet: PublicKey
): PublicKey {
  const [whitelistPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("whitelist"), config.toBuffer(), wallet.toBuffer()],
    programId
  );

  return whitelistPda;
}
