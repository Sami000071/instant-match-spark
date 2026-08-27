import { createFileRoute } from "@tanstack/react-router";
import { type StripeEnv, verifyWebhook } from "@/lib/stripe.server";

async function creditPurchase(session: any, env: StripeEnv) {
  const userId = session?.metadata?.userId as string | undefined;
  const coins = Number(session?.metadata?.coins ?? 0);
  if (!userId || !coins || Number.isNaN(coins)) {
    console.error("Checkout session missing coin metadata", session?.id);
    return;
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Idempotency: skip if this session was already credited.
  const { data: existing } = await supabaseAdmin
    .from("coin_transactions")
    .select("id")
    .eq("user_id", userId)
    .eq("reason", "purchase")
    .contains("metadata", { session_id: session.id })
    .limit(1);
  if (existing && existing.length > 0) return;

  const { error } = await supabaseAdmin.rpc("credit_coins", {
    _user_id: userId,
    _amount: coins,
    _reason: "purchase",
    _meta: {
      session_id: session.id,
      price_id: session?.metadata?.priceId ?? null,
      environment: env,
    } as never,
  });
  if (error) throw error;
}

async function handleWebhook(req: Request, env: StripeEnv) {
  const event = await verifyWebhook(req, env);

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.payment_status !== "unpaid") {
        await creditPurchase(session, env);
      }
      break;
    }
    case "checkout.session.async_payment_succeeded":
      await creditPurchase(event.data.object, env);
      break;
    default:
      console.log("Unhandled event:", event.type);
  }
}

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawEnv = new URL(request.url).searchParams.get("env");
        if (rawEnv !== "sandbox" && rawEnv !== "live") {
          console.error("Webhook received with invalid env:", rawEnv);
          return Response.json({ received: true, ignored: "invalid env" });
        }
        try {
          await handleWebhook(request, rawEnv as StripeEnv);
          return Response.json({ received: true });
        } catch (e) {
          console.error("Webhook error:", e);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
});
