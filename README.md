# RockyBet — Shielded Prediction Market on Seismic

A fully on-chain prediction market where **bet sides, amounts, and pool distribution are encrypted at the EVM level** using Seismic's confidential computing primitives. Users create yes/no markets, place bets through encrypted transactions, and claim winnings after resolution — all with cryptographic privacy guarantees.

**Live demo:** [RockyBet on Seismic Testnet](https://rockybet.vercel.app)

---

## Seismic Privacy Features Used

### `suint256` — Shielded Integer Type

Individual bets and pool-side totals are stored as `suint256` (shielded unsigned integer), Seismic's encrypted storage type. Values are encrypted at rest and during computation — neither other users nor block explorers can read them.

```solidity
// Individual bets — only the bettor can read via signedRead
mapping(address => suint256) private yesBets;
mapping(address => suint256) private noBets;

// Aggregate pool per side — shielded during betting, revealed at resolution
suint256 private sTotalYes;
suint256 private sTotalNo;
```

**Why this matters:** In a standard prediction market, anyone can see the pool distribution (e.g. 70% YES / 30% NO) and front-run or copy bets. With shielded types, pool distribution is hidden until the market resolves.

### Type `0x4a` Encrypted Transactions (`shieldedWriteContract`)

Every bet is submitted as a **type 0x4a encrypted transaction** via `seismic-viem`. The entire calldata — including the bet side (`_side` parameter) — is encrypted before reaching the mempool.

```javascript
const hash = await shieldedWriteContract(walletClient, {
  address: marketAddress,
  abi: MARKET_ABI,
  functionName: "placeBet",
  args: [BigInt(side)],       // 1=YES, 0=NO — encrypted in transit
  value: parseEther(amount),
  gas: 500_000n,
});
```

**Why this matters:** Even if someone monitors the mempool or block data, they cannot determine which side a user bet on. The `_side` parameter is a `suint256` — encrypted before submission and encrypted on-chain.

### `signedReadContract` — Authenticated Private Reads

Users view their own bet positions through **signed reads** — a Seismic primitive where `msg.sender` is cryptographically verified on read, ensuring only the bet owner can decrypt their own data.

```javascript
const result = await signedReadContract(walletClient, {
  address: marketAddress,
  abi: MARKET_ABI,
  functionName: "getMyBet",
  gas: 100_000n,
});
```

```solidity
function getMyBet() external view returns (uint256 yesBet, uint256 noBet) {
    yesBet = uint256(yesBets[msg.sender]); // decrypts only for msg.sender
    noBet = uint256(noBets[msg.sender]);
}
```

**Why this matters:** Standard `eth_call` doesn't authenticate the caller — anyone could impersonate an address and read their encrypted bets. `signedRead` requires a cryptographic proof from the caller's private key.

### Branchless Shielded Arithmetic

Bet distribution uses **branchless arithmetic** to prevent side-channel leaks. No `if/else` on the encrypted `_side` value — the math distributes the bet amount to both sides using multiplication:

```solidity
suint256 yesAdd = _side * sAmount;            // _side=1 → full amount, _side=0 → zero
suint256 noAdd  = (sOne - _side) * sAmount;   // _side=1 → zero, _side=0 → full amount

yesBets[msg.sender] = yesBets[msg.sender] + yesAdd;
noBets[msg.sender]  = noBets[msg.sender]  + noAdd;
```

**Why this matters:** Conditional branches (`if (_side == 1)`) can leak information through gas usage patterns or execution traces. Branchless math ensures identical execution regardless of which side was chosen.

---

## What Is NOT Shielded (and Why)

| Data | Shielded? | Reason |
|------|-----------|--------|
| Bet side (YES/NO) | Yes | Stored as `suint256`, submitted via type 0x4a tx |
| Bet amount per side | Yes | Stored as `suint256` per user |
| Pool totals per side | Yes (until resolution) | `sTotalYes` / `sTotalNo` are `suint256`, revealed only after deadline |
| Total pool (aggregate ETH) | No | `msg.value` is public in Ethereum — aggregate total is informational only, doesn't reveal side distribution |
| Number of bettors | No | Counter only — doesn't reveal which side anyone bet on |
| Bet existence (`hasBet`) | No | Used for UI state; knowing someone bet doesn't reveal their side or amount |
| Market question & deadline | No | Public by design — users need to see what they're betting on |
| Resolution outcome | No | Public after deadline — required for trustless claim verification |

**Design principle:** Shielded everything that could leak betting strategy (side + amount). Left public only what's necessary for the market to function or what's already visible on-chain (`msg.value`).

### The `_side` Validation Tradeoff

The `_side` parameter accepts any `suint256` value, but only `0` (NO) and `1` (YES) are valid. On-chain validation (`require(_side == 0 || _side == 1)`) is **impossible without decrypting the value**, which would defeat the purpose of shielding. This is a fundamental Seismic design tradeoff — the frontend enforces valid input via `seismic-viem`.

---

## Architecture

```
packages/
├── contracts/
│   ├── src/
│   │   ├── MarketFactory.sol    # Creates and tracks prediction markets
│   │   └── Market.sol           # Single market with shielded betting
│   └── script/
│       └── Deploy.s.sol         # Foundry deployment script
├── frontend/
│   ├── src/
│   │   ├── App.jsx              # Main app with market list, filters
│   │   ├── components/
│   │   │   ├── Header.jsx       # Wallet connection
│   │   │   ├── CreateMarket.jsx # Market creation form
│   │   │   └── MarketCard.jsx   # Bet placement, resolution, claims
│   │   ├── hooks/
│   │   │   ├── useWallet.js     # MetaMask + Seismic chain setup
│   │   │   └── useMarkets.js    # Contract interactions (shielded writes, signed reads)
│   │   └── config.js            # Contract addresses and ABIs
│   └── index.html
└── scripts/
    ├── deploy.js                # Ethers.js deployment script
    └── create-test-market.js    # Test market creation helper
```

## Contract Security

- **Reentrancy guard** — manual `_locked` mutex on all functions with external calls (OpenZeppelin not available on `ssolc`)
- **CEI pattern** — state updates before all external transfers
- **Pull pattern for fees** — 2% protocol fee accumulated in contract, admin withdraws separately via `withdrawFees()`. No external calls during `placeBet()`
- **Safety cap on claims** — payout capped at `address(this).balance - accumulatedFees` to prevent overdraw
- **No `receive()`** — contract only accepts ETH via `placeBet()` to prevent balance inflation attacks
- **Anti-spam** — 1-hour cooldown per wallet for market creation (admin exempt)
- **Input validation** — empty question check, past deadline check, zero-address check on admin transfer

## Deployed Contracts

| Contract | Address | Network |
|----------|---------|---------|
| MarketFactory | [`0x5A0211E40432662AdBdBAbde3dd798A2d0774455`](https://seismic-testnet.socialscan.io/address/0x5A0211E40432662AdBdBAbde3dd798A2d0774455) | Seismic Testnet (5124) |

## Setup

```bash
# Install dependencies
npm install
cd packages/frontend && npm install

# Configure environment
cp .env.example .env
# Add your private key to .env

# Deploy contracts
node scripts/deploy.js

# Run frontend
cd packages/frontend
npm run dev
```

## Tech Stack

- **Contracts:** Solidity 0.8.13, compiled with `ssolc` (Seismic Solidity compiler)
- **Frontend:** React 18, Vite, Tailwind CSS, shadcn/ui
- **Web3:** viem, seismic-viem (shieldedWriteContract, signedReadContract)
- **Deployment:** Foundry (forge), ethers.js deploy scripts
- **Hosting:** Vercel

## License

MIT
