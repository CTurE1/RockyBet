import { Button } from "@/components/ui/button";
import logoSrc from "@/assets/logo.png";

export default function Header({ account, connect }) {
  const short = account
    ? `${account.slice(0, 6)}...${account.slice(-4)}`
    : null;

  return (
    <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
      <div className="max-w-5xl mx-auto flex items-center justify-between px-6 h-14">
        <div className="flex items-center gap-2.5">
          <img src={logoSrc} alt="RockyBet" className="w-7 h-7" />
          <span className="text-base font-semibold tracking-tight">RockyBet</span>
          <span className="text-[10px] font-medium text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded-full ml-1">
            TESTNET
          </span>
        </div>

        {account ? (
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-emerald-400" />
            <span className="text-sm font-mono text-muted-foreground">{short}</span>
          </div>
        ) : (
          <Button onClick={connect} size="sm" className="h-8 px-4 text-xs font-medium">
            Connect Wallet
          </Button>
        )}
      </div>
    </header>
  );
}
