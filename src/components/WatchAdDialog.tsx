import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles } from "lucide-react";

const AD_DURATION_SECONDS = 15;

export default function WatchAdDialog({
  open,
  onOpenChange,
  onComplete,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onComplete: () => void;
}) {
  const [secondsLeft, setSecondsLeft] = useState(AD_DURATION_SECONDS);
  const [claiming, setClaiming] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!open) return;
    setSecondsLeft(AD_DURATION_SECONDS);
    setClaiming(false);
    intervalRef.current = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [open]);

  const ready = secondsLeft === 0;

  async function handleClaim() {
    setClaiming(true);
    onComplete();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[var(--gradient-card)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[var(--neon-lime)]" />
            Rewarded ad
          </DialogTitle>
          <DialogDescription>
            Watch the full ad to earn +5 coins.
          </DialogDescription>
        </DialogHeader>
        <div className="my-6 flex aspect-video w-full items-center justify-center rounded-xl border border-dashed border-border bg-secondary/40">
          <div className="text-center">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Sponsored
            </p>
            <p className="mt-1 text-2xl font-black text-gradient">
              {ready ? "Done!" : `${secondsLeft}s`}
            </p>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={claiming}
          >
            Cancel
          </Button>
          <Button
            onClick={handleClaim}
            disabled={!ready || claiming}
            className="bg-[var(--gradient-accent)] font-bold text-background hover:opacity-90"
          >
            {claiming ? <Loader2 className="h-4 w-4 animate-spin" /> : "Claim +5 coins"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
