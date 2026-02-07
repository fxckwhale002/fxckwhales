require("dotenv").config();

const anchor = require("@coral-xyz/anchor");
const { PublicKey, SystemProgram } = require("@solana/web3.js");

// IDL generado por Anchor
const idl = require("../target/idl/fxckwhales.json");

function mustEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Falta ${name} en .env`);
  return v.trim();
}

(async () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const programId = new PublicKey(mustEnv("PROGRAM_ID"));
  const mint = new PublicKey(process.env.MINT_ADDRESS.trim());

  const program = new anchor.Program(idl, programId, provider);

  // PDA del config
  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config"), mint.toBuffer()],
    program.programId
  );

  // 1% = 100 basis points
  const maxHoldBps = 100;

  console.log("Wallet:", provider.wallet.publicKey.toBase58());
  console.log("Mint:", mint.toBase58());
  console.log("Config PDA:", configPda.toBase58());
  console.log("maxHoldBps:", maxHoldBps);

  const tx = await program.methods
    .initializeConfig(maxHoldBps)
    .accounts({
      config: configPda,
      mint,
      authority: provider.wallet.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log("✅ Config inicializado");
  console.log("Tx:", tx);
})();
