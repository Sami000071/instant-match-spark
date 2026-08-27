import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Coins, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { getBalanceFn } from "@/lib/coins.functions";
import { StripeEmbeddedCheckout } from "@/components/StripeEmbeddedCheckout";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { paymentsConfigured } from "@/lib/stripe";

export const Route = createFileRoute("/shop")({
  validateSearch: (search: Record<string, unknown>): { checkout?: string; session_id?: string } => ({
    checkout: typeof search.checkout === "string" ? search.checkout : undefined,
    session_id: typeof search.session_id === "string" ? search.session_id : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Shop — blink coins" },
      { name: "description", content: "Top up coins to unlock premium matchmaking lobbies." },
      { property: "og:title", content: "Shop — blink coins" },
      { property: "og:description", content: "Top up coins to unlock premium matchmaking lobbies." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ShopPage,
});

const PACKAGES: {
  id: string;
  priceId: string;
  coins: number;
  price: string;
  tag?: string;
  gradient: string;
}[] = [
  { id: "starter", priceId: "coins_starter_onetime", coins: 60, price: "$3.96", gradient: "from-pink-500/30 to-pink-700/10" },
  { id: "popular", priceId: "coins_popular_onetime", coins: 140, price: "$7.96", tag: "Popular", gradient: "from-cyan-400/30 to-cyan-700/10" },
  { id: "value", priceId: "coins_value_onetime", coins: 300, price: "$13.96", tag: "Best value", gradient: "from-purple-500/30 to-purple-700/10" },
  { id: "pro", priceId: "coins_pro_onetime", coins: 600, price: "$23.96", tag: "Pro", gradient: "from-amber-400/30 to-amber-700/10" },
];

function ShopPage() {
  const { checkout } = Route.useSearch();
  const [balance, setBalance] = useState<number | null>(null);
  const [authed, setAuthed] = useState(false);
  const [activePriceId, setActivePriceId] = useState<string | null>(null);
  const getBal = useServerFn(getBalanceFn);

  async function refreshBalance() {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.user) return;
    const token = data.session.access_token;
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
    try {
      const res = await getBal({ data: undefined as never, headers });
      setBalance(res.balance);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        setAuthed(true);
        void refreshBalance();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // After returning from checkout, poll briefly while the payment is confirmed.
  useEffect(() => {
    if (checkout !== "success") return;
    toast.success("Payment received — adding your coins…");
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      void refreshBalance();
      if (tries >= 8) clearInterval(timer);
    }, 1500);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkout]);

  function handleBuy(priceId: string) {
    if (!authed) {
      toast.error("Sign in first to buy coins");
      return;
    }
    if (!paymentsConfigured()) {
      toast.error("Payments are not available yet");
      return;
    }
    setActivePriceId(priceId);
  }

  const returnUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/shop?checkout=success&session_id={CHECKOUT_SESSION_ID}`
      : "";

  return (
    <div className="relative min-h-screen overflow-y-auto">
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-20" />
      <div className="pointer-events-none absolute -top-40 -left-40 h-96 w-96 rounded-full bg-[var(--neon-pink)] opacity-20 blur-3xl animate-blob" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-[var(--neon-cyan)] opacity-20 blur-3xl animate-blob [animation-delay:-6s]" />

      <PaymentTestModeBanner />

      <main className="relative mx-auto max-w-4xl px-4 py-8">
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
              className="relative overflow-hidden rounded-2xl border border-border bg-[var(--gradient-card)] p-5 shadow-xl transition-transform hover:-translate-y-1"
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
                  onClick={() => handleBuy(pkg.priceId)}
                  className="h-11 w-full bg-[var(--gradient-accent)] font-bold text-background hover:opacity-90"
                >
                  Buy
                </Button>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-6 text-center text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Secure card payment · coins are added automatically
        </p>
      </main>

      {activePriceId && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-background/95 backdrop-blur">
          <div className="mx-auto max-w-2xl px-4 py-6">
            <button
              type="button"
              onClick={() => setActivePriceId(null)}
              className="mb-4 inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-[var(--neon-pink)]"
            >
              <X className="h-3.5 w-3.5" /> Cancel
            </button>
            <StripeEmbeddedCheckout priceId={activePriceId} returnUrl={returnUrl} />
          </div>
        </div>
      )}
    </div>
  );
}
