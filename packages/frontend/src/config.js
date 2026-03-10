export const FACTORY_ADDRESS = "0x7595227Ef1104092b4A8d18cB0ad3c510b177039";

// MetaMask chain switching params
export const SEISMIC_MM = {
  chainId: "0x1404",
  chainName: "Seismic Testnet",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: ["https://gcp-2.seismictest.net/rpc"],
  blockExplorerUrls: ["https://seismic-testnet.socialscan.io/"],
};

// Factory ABI — standard types only (no shielded params)
export const FACTORY_ABI = [
  {
    inputs: [],
    name: "admin",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "_question", type: "string" },
      { name: "_deadline", type: "uint256" },
    ],
    name: "createMarket",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "getAllMarkets",
    outputs: [{ name: "", type: "address[]" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getMarketCount",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "marketId", type: "uint256" },
      { indexed: false, name: "marketAddress", type: "address" },
      { indexed: false, name: "question", type: "string" },
      { indexed: false, name: "deadline", type: "uint256" },
    ],
    name: "MarketCreated",
    type: "event",
  },
];

// Market ABI — placeBet uses suint256 for shielded writes
export const MARKET_ABI = [
  {
    inputs: [],
    name: "admin",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
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
    inputs: [],
    name: "getMyBet",
    outputs: [
      { name: "yesBet", type: "uint256" },
      { name: "noBet", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "", type: "address" }],
    name: "hasBet",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "", type: "address" }],
    name: "claimed",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  // SHIELDED: placeBet(suint256) — calldata encrypted via type 0x4a tx
  {
    inputs: [{ name: "_side", type: "suint256" }],
    name: "placeBet",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [{ name: "_outcome", type: "bool" }],
    name: "resolve",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "claim",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "accumulatedFees",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "withdrawFees",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "bettor", type: "address" },
      { indexed: true, name: "marketId", type: "uint256" },
    ],
    name: "BetPlaced",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "bettor", type: "address" },
      { indexed: false, name: "payout", type: "uint256" },
    ],
    name: "Claimed",
    type: "event",
  },
];
