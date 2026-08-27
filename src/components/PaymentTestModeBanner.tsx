const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN;

export function PaymentTestModeBanner() {
  if (!clientToken) {
    return (
      <div className="w-full border-b border-destructive/40 bg-destructive/15 px-4 py-2 text-center text-xs text-destructive-foreground">
        Payments are not configured for this build yet.
      </div>
    );
  }
  if (clientToken.startsWith("pk_test_")) {
    return (
      <div className="w-full border-b border-[var(--neon-cyan)]/40 bg-[var(--neon-cyan)]/10 px-4 py-2 text-center text-xs text-[var(--neon-cyan)]">
        Test mode — payments in the preview are not real charges.
      </div>
    );
  }
  return null;
}
