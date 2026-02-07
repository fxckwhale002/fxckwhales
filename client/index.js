require("dotenv").config();

const anchor = require("@coral-xyz/anchor");

// IDL correcto (está en ../target/idl)
const idl = require("../target/idl/fxckwhales.json");

function mustEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Falta ${name} en .env`);
  return v.trim();
}

(async () => {
  const url = mustEnv("ANCHOR_PROVIDER_URL");
  const walletPath = mustEnv("ANCHOR_WALLET");
  const programIdStr = mustEnv("PROGRAM_ID");

  console.log("ENV URL:", url);
  console.log("ENV WALLET:", walletPath);
  console.log("ENV PROGRAM_ID:", programIdStr);

  // ✅ En Anchor 0.29, env() usa ANCHOR_PROVIDER_URL y ANCHOR_WALLET
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // ✅ Forma correcta en 0.29: Program.at(programId, provider)
  // (Anchor lee el IDL desde el workspace normalmente, pero aquí se lo damos manual)
  const programId = new anchor.web3.PublicKey(programIdStr);

  // Creamos el Program con el IDL + programId
  const program = new anchor.Program(idl, programId, provider);

  console.log("RPC:", provider.connection.rpcEndpoint);
  console.log("Wallet pubkey:", provider.wallet.publicKey.toBase58());
  console.log("ProgramId:", program.programId.toBase58());
})().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});






