/**
 * Fund all bot wallets from the main deployer wallet.
 * Usage: node scripts/bots/fund-wallets.js [total_eth]
 * Default: 0.5 ETH split evenly across all wallets
 */
import "dotenv/config";
import { createPublicClient, createWalletClient, http, parseEther, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RPC = process.env.RPC_URL || "https://gcp-2.seismictest.net/rpc";
const PRIVKEY = process.env.PRIVKEY;

if (!PRIVKEY) {
  console.error("Set PRIVKEY in .env");
  process.exit(1);
}

const chain = {
  id: 5124,
  name: "Seismic Testnet",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
};

const wallets = JSON.parse(readFileSync(join(__dirname, "wallets.json"), "utf8"));
const totalEth = process.argv[2] || "0.5";
const perWallet = (parseFloat(totalEth) / wallets.length).toFixed(6);

const account = privateKeyToAccount(PRIVKEY.startsWith("0x") ? PRIVKEY : `0x${PRIVKEY}`);
const publicClient = createPublicClient({ chain, transport: http(RPC) });
const walletClient = createWalletClient({ chain, transport: http(RPC), account });

async function main() {
  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`Funder: ${account.address}`);
  console.log(`Balance: ${formatEther(balance)} ETH`);
  console.log(`Sending ${perWallet} ETH to each of ${wallets.length} wallets (${totalEth} ETH total)\n`);

  const needed = parseEther(totalEth);
  if (balance < needed) {
    console.error(`Not enough balance. Need ${totalEth} ETH, have ${formatEther(balance)} ETH`);
    process.exit(1);
  }

  for (let i = 0; i < wallets.length; i++) {
    const w = wallets[i];
    try {
      const hash = await walletClient.sendTransaction({
        to: w.address,
        value: parseEther(perWallet),
        gas: 21000n,
      });
      console.log(`  ${i + 1}/${wallets.length} → ${w.address}  ${perWallet} ETH  tx: ${hash.slice(0, 14)}...`);
      // Small delay to avoid nonce issues
      await new Promise((r) => setTimeout(r, 1500));
    } catch (err) {
      console.error(`  ${i + 1}/${wallets.length} FAILED: ${err.shortMessage || err.message}`);
    }
  }

  console.log("\nDone. Waiting 5s for confirmations...");
  await new Promise((r) => setTimeout(r, 5000));

  // Verify balances
  console.log("\nBot wallet balances:");
  for (const w of wallets) {
    const bal = await publicClient.getBalance({ address: w.address });
    console.log(`  ${w.address}: ${formatEther(bal)} ETH`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
