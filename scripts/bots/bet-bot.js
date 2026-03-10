/**
 * RockyBet activity bot — places random shielded bets from bot wallets.
 *
 * Usage:
 *   node scripts/bots/bet-bot.js                    # default: 1 round, all wallets
 *   node scripts/bots/bet-bot.js --rounds 5         # 5 rounds with random delays
 *   node scripts/bots/bet-bot.js --rounds 5 --min-delay 30 --max-delay 120
 *
 * Each round: picks a random bot wallet, random market, random side, random amount.
 */
import "dotenv/config";
import {
  createPublicClient,
  http,
  parseEther,
  formatEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  seismicTestnetGcp2,
  createShieldedPublicClient,
  createShieldedWalletClient,
  shieldedWriteContract,
} from "seismic-viem";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RPC = process.env.RPC_URL || "https://gcp-2.seismictest.net/rpc";

// ── Config ─────────────────────────────────────────────
const FACTORY_ADDRESS = "0x7595227Ef1104092b4A8d18cB0ad3c510b177039";
const MIN_BET = 0.001;  // ETH
const MAX_BET = 0.005;  // ETH
const DEFAULT_ROUNDS = 1;
const DEFAULT_MIN_DELAY = 10;  // seconds between rounds
const DEFAULT_MAX_DELAY = 60;

const FACTORY_ABI = [
  {
    inputs: [],
    name: "getAllMarkets",
    outputs: [{ name: "", type: "address[]" }],
    stateMutability: "view",
    type: "function",
  },
];

const MARKET_ABI = [
  {
    inputs: [],
    name: "getInfo",
    outputs: [
      { name: "_question", type: "string" },
      { name: "_deadline", type: "uint256" },
      { name: "_resolved", type: "bool" },
      { name: "_outcome", type: "bool" },
      { name: "_totalPool", type: "uint256" },
      { name: "_totalBettors", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "_side", type: "suint256" }],
    name: "placeBet",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
];

// ── Parse CLI args ─────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { rounds: DEFAULT_ROUNDS, minDelay: DEFAULT_MIN_DELAY, maxDelay: DEFAULT_MAX_DELAY };
  for (let i = 0; i < args.length; i += 2) {
    if (args[i] === "--rounds") opts.rounds = parseInt(args[i + 1]);
    if (args[i] === "--min-delay") opts.minDelay = parseInt(args[i + 1]);
    if (args[i] === "--max-delay") opts.maxDelay = parseInt(args[i + 1]);
  }
  return opts;
}

// ── Helpers ────────────────────────────────────────────
const rand = (min, max) => Math.random() * (max - min) + min;
const randInt = (min, max) => Math.floor(rand(min, max + 1));
const pick = (arr) => arr[randInt(0, arr.length - 1)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getActiveMarkets(publicClient) {
  const addresses = await publicClient.readContract({
    address: FACTORY_ADDRESS,
    abi: FACTORY_ABI,
    functionName: "getAllMarkets",
  });

  const now = Math.floor(Date.now() / 1000);
  const active = [];

  for (const addr of addresses) {
    const info = await publicClient.readContract({
      address: addr,
      abi: MARKET_ABI,
      functionName: "getInfo",
    });
    const deadline = Number(info[1]);
    const resolved = info[2];
    // Normalize Seismic timestamps (may be in ms)
    const deadlineSec = deadline > 9_999_999_999 ? Math.floor(deadline / 1000) : deadline;
    if (!resolved && deadlineSec > now) {
      active.push({ address: addr, question: info[0], deadline: deadlineSec });
    }
  }
  return active;
}

async function placeBet(walletClient, publicClient, marketAddress, side, amountEth) {
  const hash = await shieldedWriteContract(walletClient, {
    address: marketAddress,
    abi: MARKET_ABI,
    functionName: "placeBet",
    args: [BigInt(side)],
    value: parseEther(amountEth),
    gas: 500_000n,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

// ── Main ───────────────────────────────────────────────
async function main() {
  const opts = parseArgs();
  const wallets = JSON.parse(readFileSync(join(__dirname, "wallets.json"), "utf8"));

  console.log(`RockyBet Bot — ${opts.rounds} round(s), ${wallets.length} wallets`);
  console.log(`Bet range: ${MIN_BET}–${MAX_BET} ETH`);
  console.log(`Delay: ${opts.minDelay}–${opts.maxDelay}s between rounds\n`);

  const transport = http(RPC);
  const publicClient = createShieldedPublicClient({
    chain: seismicTestnetGcp2,
    transport,
  });

  // Fetch active markets
  const markets = await getActiveMarkets(publicClient);
  if (markets.length === 0) {
    console.error("No active markets found. Create a market first.");
    process.exit(1);
  }
  console.log(`Active markets: ${markets.length}`);
  markets.forEach((m) => console.log(`  • ${m.question} (${m.address.slice(0, 10)}...)`));
  console.log();

  let successCount = 0;
  let failCount = 0;

  for (let round = 1; round <= opts.rounds; round++) {
    const wallet = pick(wallets);
    const market = pick(markets);
    const side = randInt(0, 1); // 0=NO, 1=YES
    const amount = rand(MIN_BET, MAX_BET).toFixed(4);
    const sideLabel = side === 1 ? "YES" : "NO";

    const pk = wallet.privateKey.startsWith("0x") ? wallet.privateKey : `0x${wallet.privateKey}`;
    const account = privateKeyToAccount(pk);

    console.log(`[${round}/${opts.rounds}] ${account.address.slice(0, 10)}... → ${sideLabel} ${amount} ETH on "${market.question.slice(0, 40)}..."`);

    try {
      // Check balance
      const balance = await publicClient.getBalance({ address: account.address });
      const needed = parseEther(amount);
      if (balance < needed + parseEther("0.0005")) { // small gas buffer
        console.log(`  ⏭ Skipped — low balance (${formatEther(balance)} ETH)`);
        failCount++;
        continue;
      }

      const walletClient = await createShieldedWalletClient({
        chain: seismicTestnetGcp2,
        transport,
        account,
      });

      const hash = await placeBet(walletClient, publicClient, market.address, side, amount);
      console.log(`  ✓ tx: ${hash.slice(0, 14)}...`);
      successCount++;
    } catch (err) {
      console.log(`  ✗ ${err.shortMessage || err.message}`);
      failCount++;
    }

    // Delay between rounds (skip after last)
    if (round < opts.rounds) {
      const delay = randInt(opts.minDelay, opts.maxDelay);
      console.log(`  … waiting ${delay}s`);
      await sleep(delay * 1000);
    }
  }

  console.log(`\nDone. ${successCount} bets placed, ${failCount} failed/skipped.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
