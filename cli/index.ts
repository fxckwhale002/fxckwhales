import { addWhitelist } from "./commands/addWhitelist";
import { removeWhitelist } from "./commands/removeWhitelist";

function printHelp() {
  console.log(`
fxckwhales CLI

Usage:
  npx ts-node cli/index.ts add-whitelist <MINT> <DESTINATION_TOKEN_ACCOUNT>
  npx ts-node cli/index.ts remove-whitelist <MINT> <DESTINATION_TOKEN_ACCOUNT>

Environment:
  ANCHOR_PROVIDER_URL   Defaults to https://api.devnet.solana.com
  ANCHOR_WALLET         Defaults to ~/.config/solana/id.json

Important:
  In the current fxckwhales design, whitelist entries are derived using the
  destination TOKEN ACCOUNT, not the wallet owner.
`);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);

  try {
    if (!command || command === "help" || command === "--help" || command === "-h") {
      printHelp();
      return;
    }

    if (command === "add-whitelist") {
      await addWhitelist(args);
      return;
    }

    if (command === "remove-whitelist") {
      await removeWhitelist(args);
      return;
    }

    throw new Error(`Unknown command: ${command}`);
  } catch (err: any) {
    console.error("❌ Error:", err?.message || err);
    process.exit(1);
  }
}

main();
