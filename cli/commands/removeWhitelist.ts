import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  deriveConfigPda,
  deriveWhitelistPda,
  getProgram,
} from "../utils/program";

export async function removeWhitelist(args: string[]) {
  const mintArg = args[0];
  const walletArg = args[1];

  if (!mintArg || !walletArg) {
    throw new Error(
      "Usage: npx ts-node cli/index.ts remove-whitelist <MINT> <DESTINATION_TOKEN_ACCOUNT>"
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
  console.log("Removed token account:", wallet.toBase58());
  console.log("Whitelist PDA:", entry.toBase58());

  const sig = await program.methods
    .removeWhitelist()
    .accounts({
      config,
      wallet,
      entry,
      authority: provider.wallet.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log("✅ remove-whitelist tx:", sig);
}
