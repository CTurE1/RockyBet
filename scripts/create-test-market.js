require("dotenv").config();
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVKEY, provider);

  const deployment = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../deployment.json"), "utf8")
  );

  const factoryABI = [
    "function createMarket(string _question, uint256 _deadline) returns (uint256)",
    "function getAllMarkets() view returns (address[])",
    "event MarketCreated(uint256 indexed marketId, address marketAddress, string question, uint256 deadline)",
  ];

  const factory = new ethers.Contract(deployment.MarketFactory, factoryABI, wallet);

  // Create a test market — deadline 24h from now (in milliseconds for Seismic)
  const deadlineMs = BigInt(Math.floor(Date.now() + 24 * 3600 * 1000));
  const question = "Will Seismic launch mainnet in 2026?";

  console.log("Creating market:", question);
  console.log("Deadline:", new Date(Number(deadlineMs)).toISOString());

  const tx = await factory.createMarket(question, deadlineMs);
  const receipt = await tx.wait();
  console.log("Tx hash:", receipt.hash);

  // Get created market address from event
  const event = receipt.logs.find((l) => {
    try {
      return factory.interface.parseLog(l)?.name === "MarketCreated";
    } catch {
      return false;
    }
  });

  if (event) {
    const parsed = factory.interface.parseLog(event);
    console.log("Market ID:", parsed.args.marketId.toString());
    console.log("Market address:", parsed.args.marketAddress);
  }

  const all = await factory.getAllMarkets();
  console.log("Total markets:", all.length);
}

main().catch(console.error);
