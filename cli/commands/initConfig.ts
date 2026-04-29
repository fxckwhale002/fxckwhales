import { PublicKey, SystemProgram } from "@solana/web3.js";
import { deriveConfigPda, getProgram } from "../utils/program";

export async function initConfig(args: string[]) {
  const mintArg = args[0];
  const maxHoldBpsArg = args[1] || "100";

  if (!mintArg) {
    throw new Error(
      "Usage: npx ts-node cli/index.ts init-config <MINT> <MAX_HOLD_BPS>"
    );
  }

  const mint = new PublicKey(mintArg);
  const maxHoldBps = Number(maxHoldBpsArg);

  if (!Number.isInteger(maxHoldBps) || maxHoldBps <= 0 || maxHoldBps > 10000) {
    throw new Error("MAX_HOLD_BPS must be an integer between 1 and 10000");
  }

  const { program, provider, programId } = getProgram();

  const config = deriveConfigPda(programId, mint);

  console.log("Cluster:", provider.connection.rpcEndpoint);
  console.log("Program:", programId.toBase58());
  console.log("Mint:", mint.toBase58());
  console.log("Config PDA:", config.toBase58());
  console.log("Max hold bps:", maxHoldBps);

  const sig = await program.methods
    .initializeConfig(maxHoldBps)
    .accounts({
      authority: provider.wallet.publicKey,
      mint,
      config,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log("✅ init-config tx:", sig);
}
