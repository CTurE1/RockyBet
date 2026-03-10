import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";

const DURATIONS = [
  { value: "5", label: "5 min" },
  { value: "15", label: "15 min" },
  { value: "60", label: "1 hour" },
  { value: "360", label: "6 hours" },
  { value: "1440", label: "24 hours" },
  { value: "4320", label: "3 days" },
  { value: "10080", label: "7 days" },
];
const LABEL = Object.fromEntries(DURATIONS.map((d) => [d.value, d.label]));

export default function CreateMarket({ onCreate }) {
  const [question, setQuestion] = useState("");
  const [minutes, setMinutes] = useState("1440");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!question.trim() || busy) return;
    setBusy(true);
    try {
      const deadlineUnix =
        Math.floor(Date.now() / 1000 + Number(minutes) * 60);
      await onCreate(question.trim(), deadlineUnix);
      setQuestion("");
      setMinutes("1440");
      setOpen(false);
      showToast("Market created!", "success");
    } catch (err) {
      showToast(err.reason || err.shortMessage || err.message || "Failed to create market");
    } finally {
      setBusy(false);
    }
  };

  const toastEl = toast && (
    <div className={`mt-2 text-xs px-3 py-2 rounded-lg transition-all ${
      toast.type === "success"
        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
        : "bg-red-500/10 text-red-400 border border-red-500/20"
    }`}>
      {toast.msg}
    </div>
  );

  if (!open) {
    return (
      <div>
        <button
          onClick={() => setOpen(true)}
          className="w-full rounded-xl border border-dashed border-border hover:border-primary/40 bg-card/50 hover:bg-card p-4 text-sm text-muted-foreground hover:text-foreground transition-all flex items-center justify-center gap-2"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-primary">
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          Launch a shielded market
        </button>
        {toastEl}
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-primary/20 bg-card p-4 space-y-3"
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">New Shielded Market</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-muted-foreground hover:text-foreground text-xs"
        >
          Cancel
        </button>
      </div>
      <Input
        autoFocus
        placeholder="Will ETH hit $10k by end of 2026?"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        className="h-10"
      />
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground">Closes in</span>
        <Select value={minutes} onValueChange={setMinutes}>
          <SelectTrigger className="w-[120px] h-8 text-xs">
            {LABEL[minutes]}
          </SelectTrigger>
          <SelectContent>
            {DURATIONS.map((d) => (
              <SelectItem key={d.value} value={d.value}>
                {d.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="submit"
          disabled={busy || !question.trim()}
          size="sm"
          className="ml-auto h-8 px-6"
        >
          {busy ? "Creating..." : "Create"}
        </Button>
      </div>
      {toastEl}
    </form>
  );
}
