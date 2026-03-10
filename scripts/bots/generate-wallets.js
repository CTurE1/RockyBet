/**
 * Generate bot wallets for RockyBet activity simulation.
 * Run once: node scripts/bots/generate-wallets.js
 * Saves 15 wallets to scripts/bots/wallets.json
 */
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WALLETS_FILE = join(__dirname, "wallets.json");
const NUM_WALLETS = 15;

if (existsSync(WALLETS_FILE)) {
  console.log("wallets.json already exists. Delete it first to regenerate.");
  process.exit(0);
}

const wallets = [];
for (let i = 0; i < NUM_WALLETS; i++) {
  const pk = generatePrivateKey();
  const account = privateKeyToAccount(pk);
  wallets.push({ address: account.address, privateKey: pk });
}

writeFileSync(WALLETS_FILE, JSON.stringify(wallets, null, 2));

console.log(`Generated ${NUM_WALLETS} wallets → wallets.json`);
wallets.forEach((w, i) => console.log(`  ${i + 1}. ${w.address}`));
