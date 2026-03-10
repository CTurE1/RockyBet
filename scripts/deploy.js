require("dotenv").config();
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

async function main() {
  const rpc = process.env.RPC_URL;
  const pk = process.env.PRIVKEY;

  if (!rpc || !pk) {
    console.error("Set RPC_URL and PRIVKEY in .env");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(rpc);
  const wallet = new ethers.Wallet(pk, provider);

  console.log("Deployer:", wallet.address);
  const balance = await provider.getBalance(wallet.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH");

  // Load compiled MarketFactory
  const artifact = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "../packages/contracts/out/MarketFactory.json"),
      "utf8"
    )
  );

  const factory = new ethers.ContractFactory(
    artifact.abi,
    artifact.bytecode,
    wallet
  );

  console.log("\nDeploying MarketFactory...");
  const contract = await factory.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("MarketFactory deployed to:", address);

  // Verify admin
  const admin = await contract.admin();
  console.log("Admin:", admin);

  // Save deployment info
  const deployInfo = {
    network: "seismic-testnet",
    chainId: 5124,
    MarketFactory: address,
    deployer: wallet.address,
    deployedAt: new Date().toISOString(),
  };

  fs.writeFileSync(
    path.join(__dirname, "../deployment.json"),
    JSON.stringify(deployInfo, null, 2)
  );
  console.log("\nDeployment info saved to deployment.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
