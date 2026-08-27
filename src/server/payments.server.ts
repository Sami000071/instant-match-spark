// Server-only Stripe checkout helpers for the coin shop.
import type Stripe from "stripe";
import { type StripeEnv, createStripeClient, getStripeErrorMessage } from "@/lib/stripe.server";

// Human-readable price id -> coins granted on successful payment.
export const COIN_PRICE_MAP: Record<string, number> = {
  coins_starter_onetime: 60,
  coins_popular_onetime: 140,
  coins_value_onetime: 300,
  coins_pro_onetime: 600,
};

async function resolveOrCreateCustomer(
  stripe: Stripe,
  options: { email?: string; userId?: string },
): Promise<string> {
  if (options.userId && !/^[a-zA-Z0-9_-]+$/.test(options.userId)) {
    throw new Error("Invalid userId");
  }
  if (options.userId) {
    const found = await stripe.customers.search({
      query: `metadata['userId']:'${options.userId}'`,
      limit: 1,
    });
    if (found.data.length) return found.data[0].id;
  }
  if (options.email) {
    const existing = await stripe.customers.list({ email: options.email, limit: 1 });
    if (existing.data.length) {
      const customer = existing.data[0];
      if (options.userId && customer.metadata?.userId !== options.userId) {
        await stripe.customers.update(customer.id, {
          metadata: { ...customer.metadata, userId: options.userId },
        });
      }
      return customer.id;
    }
  }
  const created = await stripe.customers.create({
    ...(options.email && { email: options.email }),
    ...(options.userId && { metadata: { userId: options.userId } }),
  });
  return created.id;
}

export async function createCoinCheckoutSession(params: {
  priceId: string;
  returnUrl: string;
  environment: StripeEnv;
  userId: string;
  email?: string;
}): Promise<{ clientSecret: string } | { error: string }> {
  const coins = COIN_PRICE_MAP[params.priceId];
  if (!coins) return { error: "Unknown coin package" };

  try {
    const stripe = createStripeClient(params.environment);
    const prices = await stripe.prices.list({ lookup_keys: [params.priceId] });
    if (!prices.data.length) return { error: "Price not found" };
    const stripePrice = prices.data[0];

    const productId =
      typeof stripePrice.product === "string" ? stripePrice.product : stripePrice.product.id;
    const product = await stripe.products.retrieve(productId);

    const customerId = await resolveOrCreateCustomer(stripe, {
      email: params.email,
      userId: params.userId,
    });

    // Preferred method list: card (Apple Pay / Google Pay wallets ride on
    // this), Link and PayPal. Cash App Pay intentionally excluded.
    // Some methods may not be activated on the account (e.g. PayPal in live
    // mode), so fall back progressively instead of failing checkout.
    const methodSets: string[][] = [
      ["card", "link", "paypal"],
      ["card", "link"],
      ["card"],
    ];

    let lastError: unknown;
    for (const paymentMethodTypes of methodSets) {
      try {
        const session = await stripe.checkout.sessions.create({
          line_items: [{ price: stripePrice.id, quantity: 1 }],
          mode: "payment",
          ui_mode: "embedded_page",
          return_url: params.returnUrl,
          customer: customerId,
          payment_method_types: paymentMethodTypes,
          payment_intent_data: { description: product.name },
          automatic_tax: { enabled: true },
          customer_update: { address: "auto" },

          metadata: {
            userId: params.userId,
            coins: String(coins),
            priceId: params.priceId,
          },
        } as Stripe.Checkout.SessionCreateParams);

        return { clientSecret: session.client_secret ?? "" };
      } catch (error) {
        lastError = error;
        const message = getStripeErrorMessage(error);
        // Only retry when the failure is about an unavailable method type.
        if (!/payment method type/i.test(message)) throw error;
      }
    }

    throw lastError;

  } catch (error) {
    return { error: getStripeErrorMessage(error) };
  }
}
