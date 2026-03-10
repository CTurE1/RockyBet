import { useState, useEffect } from "react";
import { useWallet, getPublicClient } from "./hooks/useWallet";
import { useMarkets } from "./hooks/useMarkets";
import Header from "./components/Header";
import CreateMarket from "./components/CreateMarket";
import MarketCard from "./components/MarketCard";
import { FACTORY_ADDRESS, FACTORY_ABI } from "./config";
import logoSrc from "./assets/logo.png";

export default function App() {
  const { account, walletClient, connect } = useWallet();
  const {
    markets,
    loading,
    createMarket,
    placeBet,
    resolveMarket,
    claimWinnings,
    withdrawFees,
    getMyBet,
  } = useMarkets(walletClient, account);

  const [adminAddress, setAdminAddress] = useState(null);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    getPublicClient()
      .readContract({
        address: FACTORY_ADDRESS,
        abi: FACTORY_ABI,
        functionName: "admin",
      })
      .then(setAdminAddress)
      .catch(() => {});
  }, []);

  const activeMarkets = markets.filter((m) => !m.resolved);
  const resolvedMarkets = markets.filter((m) => m.resolved);
  const shown =
    filter === "active"
      ? activeMarkets
      : filter === "resolved"
      ? resolvedMarkets
      : markets;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header account={account} connect={connect} />

      <main className="max-w-3xl mx-auto px-4 pt-8 pb-16">
        {/* Hero */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold tracking-tight">Prediction Markets</h2>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
            Bet sides and stakes live as{" "}
            <span className="text-primary font-medium">suint256</span> shielded
            types — encrypted at the EVM level. Every wager ships as a{" "}
            <span className="text-primary font-medium">type 0x4a</span> encrypted
            transaction. Pool math is branchless and shielded — zero side-channel
            leaks. Only your wallet reveals your position via cryptographic{" "}
            <span className="text-primary font-medium">signedRead</span>.
            You know your bet. Nobody else does.
          </p>
        </div>

        {/* Create market — cooldown enforced on-chain (1h per wallet, admin exempt) */}
        {account && (
          <div className="mb-6">
            <CreateMarket onCreate={createMarket} />
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex items-center gap-1 mb-4">
          {[
            { key: "all", label: `All (${markets.length})` },
            { key: "active", label: `Active (${activeMarkets.length})` },
            { key: "resolved", label: `Resolved (${resolvedMarkets.length})` },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                filter === key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Markets list */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-muted-foreground">Loading markets...</span>
          </div>
        ) : shown.length === 0 ? (
          <div className="text-center py-20">
            <img src={logoSrc} alt="" className="w-16 h-16 mx-auto mb-3 opacity-20" />
            <p className="text-muted-foreground text-sm">
              {filter === "resolved"
                ? "No resolved markets yet — still anyone's game"
                : "No markets yet — launch the first shielded prediction"}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {shown.map((m) => (
              <MarketCard
                key={m.address}
                market={m}
                account={account}
                adminAddress={adminAddress}
                onPlaceBet={placeBet}
                onResolve={resolveMarket}
                onClaim={claimWinnings}
                onWithdrawFees={withdrawFees}
                onGetMyBet={getMyBet}
                onConnect={connect}
              />
            ))}
          </div>
        )}

        {/* Footer */}
        <footer className="mt-16 pt-6 border-t border-border text-center space-y-2">
          <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
            <a
              href={`https://seismic-testnet.socialscan.io/address/${FACTORY_ADDRESS}`}
              target="_blank"
              rel="noreferrer"
              className="hover:text-primary transition-colors"
            >
              Contract
            </a>
            <span className="text-border">|</span>
            <a
              href="https://seismic.systems"
              target="_blank"
              rel="noreferrer"
              className="hover:text-primary transition-colors"
            >
              Seismic Network
            </a>
            <span className="text-border">|</span>
            <span>Chain ID 5124</span>
            <span className="text-border">|</span>
            <a
              href="https://x.com/VadimWright"
              target="_blank"
              rel="noreferrer"
              className="hover:text-primary transition-colors"
            >
              Built by @VadimWright
            </a>
          </div>
          <p className="text-[11px] text-muted-foreground/40">
            suint256 shielded types · type 0x4a encrypted tx · signedRead private positions · branchless shielded arithmetic — full-stack privacy on Seismic
          </p>
        </footer>
      </main>
    </div>
  );
}
