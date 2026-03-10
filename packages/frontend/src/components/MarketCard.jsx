import { useState, useEffect, memo } from "react";
import { formatEther } from "viem";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const toSec = (t) => (t > 9_999_999_999 ? Math.floor(t / 1000) : t);

// Isolated countdown — only this tiny span re-renders every second, not the whole card
function Countdown({ deadlineSec }) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  const diff = deadlineSec - now;
  if (diff <= 0) return null;
  const d = Math.floor(diff / 86400);
  const h = Math.floor((diff % 86400) / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  let text;
  if (d > 0) text = `${d}d ${h}h`;
  else if (h > 0) text = `${h}h ${m}m`;
  else if (m > 0) text = `${m}m ${s}s`;
  else text = `${s}s`;
  return (
    <span className="text-[11px] text-muted-foreground font-mono tabular-nums">
      {text}
    </span>
  );
}

function MarketCard({
  market,
  account,
  adminAddress,
  onPlaceBet,
  onResolve,
  onClaim,
  onWithdrawFees,
  onGetMyBet,
  onConnect,
}) {
  const [amount, setAmount] = useState("0.001");
  const [busy, setBusy] = useState(false);
  const [myBet, setMyBet] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [loadingBet, setLoadingBet] = useState(false);
  const [toast, setToast] = useState(null);

  const deadlineSec = toSec(market.deadline);
  // Static expiry check — no per-second re-renders; polling re-fetch catches the transition
  const isExpired = deadlineSec <= Math.floor(Date.now() / 1000);
  const isAdmin =
    account &&
    adminAddress &&
    account.toLowerCase() === adminAddress.toLowerCase();
  const poolEth = Number(formatEther(market.totalPool));

  const showToast = (msg, type = "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const hasBet = market.userHasBet;
  const hasBetDetails = myBet && (myBet.yesBet > 0n || myBet.noBet > 0n);
  const canBet = !market.resolved && !isExpired && account;

  const loadMyBet = async () => {
    if (!onGetMyBet || hasBetDetails || loadingBet) return;
    setLoadingBet(true);
    try {
      const b = await onGetMyBet(market.address);
      setMyBet(b);
    } catch (err) {
      console.error("signedRead error:", err);
      showToast(err.shortMessage || err.message || "signedRead failed");
    } finally {
      setLoadingBet(false);
    }
  };

  const bet = async (side) => {
    setBusy(true);
    try {
      await onPlaceBet(market.address, side, amount);
      const b = await onGetMyBet(market.address);
      setMyBet(b);
      setExpanded(false);
      showToast("Bet placed!", "success");
    } catch (err) {
      showToast(err.reason || err.shortMessage || err.message || "Bet failed");
    } finally {
      setBusy(false);
    }
  };

  const resolve = async (outcome) => {
    setBusy(true);
    try {
      await onResolve(market.address, outcome);
      showToast("Market resolved!", "success");
    } catch (err) {
      showToast(err.reason || err.shortMessage || err.message || "Resolve failed");
    } finally {
      setBusy(false);
    }
  };

  const claim = async () => {
    setBusy(true);
    try {
      const payout = await onClaim(market.address);
      if (payout) {
        const eth = Number(formatEther(payout)).toFixed(4);
        showToast(`Claimed ${eth} ETH!`, "success");
      } else {
        showToast("Winnings claimed!", "success");
      }
    } catch (err) {
      showToast(err.reason || err.shortMessage || err.message || "Claim failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="group rounded-xl border border-border bg-card hover:border-primary/30 transition-all duration-200">
      {/* Toast notification */}
      {toast && (
        <div
          className={`rounded-t-xl px-4 py-2 text-xs font-medium transition-opacity duration-200 ${
            toast.type === "success"
              ? "bg-emerald-500/10 text-emerald-400"
              : "bg-red-500/10 text-red-400"
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* Main row */}
      <div
        className="flex items-start gap-4 p-4 cursor-pointer"
        onClick={() => canBet && setExpanded(!expanded)}
      >
        {/* Shield icon */}
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-primary">
            <path d="M12 2L3 7v6c0 5.25 3.83 10.15 9 11 5.17-.85 9-5.75 9-11V7l-9-5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h3 className="text-[15px] font-medium text-foreground leading-snug">
            {market.question}
          </h3>
          <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
            <span>{poolEth.toFixed(4)} ETH</span>
            <span className="text-border">|</span>
            <span>{market.totalBettors} bettors</span>
            {hasBet && (
              <>
                <span className="text-border">|</span>
                <span className="text-primary">You bet</span>
              </>
            )}
          </div>
        </div>

        {/* Right side — status + quick bet buttons */}
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          {market.resolved ? (
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
              market.outcome
                ? "bg-emerald-500/10 text-emerald-400"
                : "bg-red-500/10 text-red-400"
            }`}>
              {market.outcome ? "YES" : "NO"}
            </span>
          ) : isExpired ? (
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-muted text-muted-foreground">
              Awaiting resolution
            </span>
          ) : (
            <>
              <Countdown deadlineSec={deadlineSec} />
              <div className="flex gap-1.5">
                <button
                  onClick={(e) => { e.stopPropagation(); account ? setExpanded(true) : onConnect?.(); }}
                  className="text-xs font-semibold px-4 py-1.5 rounded-md bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-colors"
                >
                  Yes
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); account ? setExpanded(true) : onConnect?.(); }}
                  className="text-xs font-semibold px-4 py-1.5 rounded-md bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors"
                >
                  No
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Expanded bet panel — smooth open/close */}
      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${
          expanded && canBet ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className="border-t border-border px-4 py-3 space-y-3 bg-muted/30">
            <div className="flex items-center gap-2">
              <Input
                type="number"
                step="0.001"
                min="0.001"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-9 font-mono text-sm max-w-[140px]"
                onClick={(e) => e.stopPropagation()}
              />
              <span className="text-xs text-muted-foreground">ETH</span>
              <div className="flex gap-1 ml-auto">
                {["0.001", "0.005", "0.01"].map((v) => (
                  <button
                    key={v}
                    onClick={(e) => { e.stopPropagation(); setAmount(v); }}
                    className={`text-[11px] px-2 py-1 rounded border transition-colors ${
                      amount === v
                        ? "border-primary text-primary"
                        : "border-border text-muted-foreground hover:border-primary/50"
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => bet(1)}
                disabled={busy}
                className="flex-1 h-10 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
              >
                {busy ? "Placing..." : `Bet YES — ${amount} ETH`}
              </Button>
              <Button
                onClick={() => bet(0)}
                disabled={busy}
                variant="destructive"
                className="flex-1 h-10 font-semibold"
              >
                {busy ? "Placing..." : `Bet NO — ${amount} ETH`}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground/60 text-center">
              Shielded via type 0x4a tx · suint256 encrypted side + amount · branchless arithmetic · 2% protocol fee
            </p>
          </div>
        </div>
      </div>

      {/* Your bet detail — loaded on demand via signedRead */}
      {hasBet && !expanded && (
        <div className="border-t border-border px-4 py-2.5 flex items-center gap-3 text-xs">
          {hasBetDetails ? (
            <>
              <span className="text-muted-foreground">Your position (via signedRead):</span>
              {myBet.yesBet > 0n && (
                <span className="text-emerald-400 font-mono">
                  YES {Number(formatEther(myBet.yesBet)).toFixed(4)} ETH
                </span>
              )}
              {myBet.noBet > 0n && (
                <span className="text-red-400 font-mono">
                  NO {Number(formatEther(myBet.noBet)).toFixed(4)} ETH
                </span>
              )}
            </>
          ) : (
            <button
              onClick={loadMyBet}
              disabled={loadingBet}
              className="text-primary hover:text-primary/80 transition-colors"
            >
              {loadingBet ? "Loading..." : "View my position (signedRead)"}
            </button>
          )}
        </div>
      )}

      {/* Admin resolve + withdraw fees */}
      {isAdmin && isExpired && !market.resolved && (
        <div className="border-t border-border px-4 py-3 flex items-center gap-2">
          <span className="text-xs text-muted-foreground mr-auto">Admin:</span>
          <Button
            onClick={() => resolve(true)}
            disabled={busy}
            size="sm"
            className="h-7 text-xs bg-emerald-700 hover:bg-emerald-600 text-white"
          >
            Resolve YES
          </Button>
          <Button
            onClick={() => resolve(false)}
            disabled={busy}
            size="sm"
            variant="destructive"
            className="h-7 text-xs"
          >
            Resolve NO
          </Button>
        </div>
      )}

      {isAdmin && poolEth > 0 && (
        <div className="border-t border-border px-4 py-2.5 flex items-center gap-2">
          <span className="text-xs text-muted-foreground mr-auto">
            Protocol fees (2% of pool)
          </span>
          <Button
            onClick={async () => {
              setBusy(true);
              try {
                await onWithdrawFees(market.address);
                showToast("Fees withdrawn!", "success");
              } catch (err) {
                showToast(err.reason || err.shortMessage || err.message || "Withdraw failed");
              } finally {
                setBusy(false);
              }
            }}
            disabled={busy}
            size="sm"
            variant="outline"
            className="h-7 text-xs"
          >
            {busy ? "..." : "Withdraw Fees"}
          </Button>
        </div>
      )}

      {/* Claim / Result */}
      {market.resolved && account && hasBet && (
        <div className="border-t border-border px-4 py-3 space-y-2">
          {hasBetDetails ? (
            (() => {
              const won = market.outcome ? myBet.yesBet > 0n : myBet.noBet > 0n;
              const userBetTotal = myBet.yesBet + myBet.noBet;
              const betEth = Number(formatEther(userBetTotal)).toFixed(4);
              const side = myBet.yesBet > 0n ? "YES" : "NO";
              const sideColor = myBet.yesBet > 0n ? "text-emerald-400" : "text-red-400";
              return (
                <>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Your bet:</span>
                    <span className={`font-mono font-medium ${sideColor}`}>
                      {side} {betEth} ETH
                    </span>
                  </div>
                  {won ? (
                    <>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Result:</span>
                        <span className="text-emerald-400 font-medium">Won</span>
                      </div>
                      {!market.userClaimed ? (
                        <Button onClick={claim} disabled={busy} className="w-full h-9 font-medium bg-emerald-600 hover:bg-emerald-500">
                          {busy ? "Claiming..." : "Claim Winnings"}
                        </Button>
                      ) : (
                        <p className="text-center text-xs text-emerald-400/70">Claimed</p>
                      )}
                    </>
                  ) : (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Result:</span>
                      <span className="text-red-400 font-medium">Lost {betEth} ETH</span>
                    </div>
                  )}
                </>
              );
            })()
          ) : (
            <Button
              onClick={loadMyBet}
              disabled={loadingBet}
              variant="outline"
              className="w-full h-9 font-medium"
            >
              {loadingBet ? "Checking..." : "Check result (signedRead)"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// React.memo — card won't re-render when parent state changes unless its own props changed
export default memo(MarketCard);
