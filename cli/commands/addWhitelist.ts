import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  deriveConfigPda,
  deriveWhitelistPda,
  getProgram,
} from "../utils/program";

export async function addWhitelist(args: string[]) {
  const mintArg = args[0];
  const walletArg = args[1];

  if (!mintArg || !walletArg) {
    throw new Error(
      "Usage: npx ts-node cli/index.ts add-whitelist <MINT> <DESTINATION_TOKEN_ACCOUNT>"
    );
  }

  const mint = new PublicKey(mintArg);
  const wallet = new PublicKey(walletArg);

  const { program, provider, programId } = getProgram();

  const config = deriveConfigPda(programId, mint);
  const entry = deriveWhitelistPda(programId, config, wallet);

  console.log("Cluster:", provider.connection.rpcEndpoint);
  console.log("Program:", programId.toBase58());
  console.log("Mint:", mint.toBase58());
  console.log("Config PDA:", config.toBase58());
  console.log("Whitelisted token account:", wallet.toBase58());
  console.log("Whitelist PDA:", entry.toBase58());

  const sig = await program.methods
    .addWhitelist({ liquidityPool: {} })
    .accounts({
      config,
      wallet,
      entry,
      authority: provider.wallet.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log("✅ add-whitelist tx:", sig);
}
