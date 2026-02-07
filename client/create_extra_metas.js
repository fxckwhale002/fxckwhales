require("dotenv").config();
const anchor = require("@coral-xyz/anchor");
const { PublicKey, SystemProgram } = require("@solana/web3.js");

// Paquete SPL del transfer-hook interface
const {
  getExtraAccountMetaAddress,
  createInitializeExtraAccountMetaListInstruction,
  ExtraAccountMetaListLayout,
} = require("@solana/spl-transfer-hook-interface");

const idl = require("../target/idl/fxckwhales.json");

function mustEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Falta ${name} en .env`);
  return v.trim();
}

(async () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const connection = provider.connection;

  const hookProgramId = new PublicKey(mustEnv("PROGRAM_ID"));
  const mint = new PublicKey(mustEnv("MINT_ADDRESS"));
  const program = new anchor.Program(idl, hookProgramId, provider);
  const authority = provider.wallet.publicKey;

  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config"), mint.toBuffer()],
    hookProgramId
  );

  // PDA oficial del metas list (según SPL)
  const metaListPda = getExtraAccountMetaAddress(mint, hookProgramId);
  console.log("ExtraAccountMetaList PDA:", metaListPda.toBase58());

  // Metas que tu hook necesita:
  // - config PDA (siempre)
  // - whitelist entry del DESTINO (opcional, pero lo metemos para que esté)
  //
  // OJO: el whitelist entry depende del DESTINO, pero el metas list puede derivarlo por seeds.
  // Aquí lo dejamos solo con config para que al menos ejecute el hook.
  const extraMetas = [
    {
      discriminator: 0, // "Account" (direct)
      addressConfig: {
        pubkey: configPda,
        isSigner: false,
        isWritable: false,
      },
    },
  ];

  // Construye la instrucción para inicializar el meta list
  const ix = createInitializeExtraAccountMetaListInstruction(
    mint,
    authority,          // authority del mint/transfer hook
    metaListPda,
    hookProgramId,
    extraMetas
  );

  const tx = new anchor.web3.Transaction().add(ix);
  const sig = await provider.sendAndConfirm(tx, [], { commitment: "confirmed" });

  console.log("✅ ExtraAccountMetaList creado. Tx:", sig);
})();
