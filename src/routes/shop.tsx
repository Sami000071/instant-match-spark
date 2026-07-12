import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Coins, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { getBalanceFn, purchaseCoinsFn } from "@/lib/coins.functions";



export const Route = createFileRoute("/shop")({
  head: () => ({
    meta: [
      { title: "Shop — blink coins" },
      { name: "description", content: "Top up coins to unlock premium matchmaking lobbies." },
      { property: "og:title", content: "Shop — blink coins" },
      { property: "og:description", content: "Top up coins to unlock premium matchmaking lobbies." },
    ],
  }),
  component: ShopPage,
});

const PACKAGES: { id: "starter" | "popular" | "value" | "pro"; coins: number; price: string; tag?: string; gradient: string }[] = [
  { id: "starter", coins: 60, price: "$3.96", gradient: "from-pink-500/30 to-pink-700/10" },
  { id: "popular", coins: 140, price: "$7.96", tag: "Popular", gradient: "from-cyan-400/30 to-cyan-700/10" },
  { id: "value", coins: 300, price: "$13.96", tag: "Best value", gradient: "from-purple-500/30 to-purple-700/10" },
  { id: "pro", coins: 600, price: "$23.96", tag: "Pro", gradient: "from-amber-400/30 to-amber-700/10" },
];

function ShopPage() {
  const [balance, setBalance] = useState<number | null>(null);
  const [authed, setAuthed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [adOpen, setAdOpen] = useState(false);
  const getBal = useServerFn(getBalanceFn);
  const buy = useServerFn(purchaseCoinsFn);
  const claim = useServerFn(claimAdRewardFn);

  async function getAuthHeaders(): Promise<HeadersInit> {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        setAuthed(true);
        const token = data.session.access_token;
        const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
        getBal({ data: undefined as never, headers })
          .then(({ balance }) => setBalance(balance))
          .catch(() => {});
      }
    });
  }, [getBal]);

  async function handleBuy(id: "starter" | "popular" | "value" | "pro") {
    if (!authed) {
      toast.error("Sign in first to buy coins");
      return;
    }
    setBusy(id);
    try {
      const headers = await getAuthHeaders();
      const { balance, coins } = await buy({ data: { packageId: id }, headers });
      setBalance(balance);
      toast.success(`Purchase successful — +${coins} coins`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Purchase failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleAdComplete() {
    try {
      const headers = await getAuthHeaders();
      const { balance, reward } = await claim({ data: undefined as never, headers });
      setBalance(balance);
      toast.success(`You earned ${reward} coins`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Try again later";
      if (msg.includes("COOLDOWN")) toast.error("Slow down — try again in a moment");
      else if (msg.includes("DAILY_CAP")) toast.error("Daily ad limit reached. Come back tomorrow!");
      else toast.error(msg);
    } finally {
      setAdOpen(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-20" />
      <div className="pointer-events-none absolute -top-40 -left-40 h-96 w-96 rounded-full bg-[var(--neon-pink)] opacity-20 blur-3xl animate-blob" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-[var(--neon-cyan)] opacity-20 blur-3xl animate-blob [animation-delay:-6s]" />

      <main className="relative mx-auto max-w-4xl px-4 py-10">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-[var(--neon-pink)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back home
        </Link>

        <div className="mb-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-4xl font-black tracking-tight md:text-5xl">
              Coin <span className="text-gradient">Shop</span>
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Top up to enter premium lobbies and unlock future perks.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-[var(--neon-pink)]/40 bg-[var(--neon-pink)]/10 px-4 py-2">
            <Coins className="h-4 w-4 text-[var(--neon-pink)]" />
            <span className="text-sm font-bold tabular-nums">
              {authed ? (balance == null ? "…" : balance.toLocaleString()) : "Sign in"}
            </span>
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">coins</span>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PACKAGES.map((pkg) => (
            <div
              key={pkg.id}
              className={`relative overflow-hidden rounded-2xl border border-border bg-[var(--gradient-card)] p-5 shadow-xl transition-transform hover:-translate-y-1`}
            >
              <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${pkg.gradient} opacity-60`} />
              <div className="relative flex flex-col gap-4">
                {pkg.tag && (
                  <span className="self-start rounded-full border border-[var(--neon-cyan)]/40 bg-[var(--neon-cyan)]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--neon-cyan)]">
                    {pkg.tag}
                  </span>
                )}
                <div className="flex items-baseline gap-2">
                  <Coins className="h-7 w-7 text-[var(--neon-pink)]" />
                  <span className="text-4xl font-black tabular-nums">{pkg.coins}</span>
                </div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground">coins</p>
                <p className="text-2xl font-black">{pkg.price}</p>
                <Button
                  onClick={() => handleBuy(pkg.id)}
                  disabled={busy === pkg.id}
                  className="h-11 w-full bg-[var(--gradient-accent)] font-bold text-background hover:opacity-90"
                >
                  {busy === pkg.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buy"}
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-2xl border border-border bg-[var(--gradient-card)] p-6 shadow-xl">
          <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-bold">
                <Sparkles className="h-5 w-5 text-[var(--neon-lime)]" />
                Earn free coins
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Watch a short ad to get +5 coins. Limit 20/day.
              </p>
            </div>
            <Button
              onClick={() => setAdOpen(true)}
              variant="outline"
              className="h-11 border-[var(--neon-lime)]/40 bg-transparent font-bold hover:bg-[var(--neon-lime)]/10"
            >
              Watch ad · +5
            </Button>
          </div>
        </div>

        <p className="mt-6 text-center text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Demo prices · payments coming soon
        </p>
      </main>

      <WatchAdDialog
        open={adOpen}
        onOpenChange={setAdOpen}
        onComplete={handleAdComplete}
      />
    </div>
  );
}
