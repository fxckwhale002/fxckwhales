import "../..//scripts/smoke-devnet";

export async function smokeDevnet() {
  console.log("🚀 Running devnet smoke test...\n");

  try {
    await require("../../scripts/smoke-devnet");
  } catch (err: any) {
    console.error("❌ Smoke test failed:", err?.message || err);
    process.exit(1);
  }
}
