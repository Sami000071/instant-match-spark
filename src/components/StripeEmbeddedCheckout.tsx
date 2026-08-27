import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { useServerFn } from "@tanstack/react-start";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import { createCoinCheckoutFn } from "@/lib/payments.functions";

export function StripeEmbeddedCheckout({
  priceId,
  returnUrl,
}: {
  priceId: string;
  returnUrl: string;
}) {
  const createCheckout = useServerFn(createCoinCheckoutFn);

  const fetchClientSecret = async (): Promise<string> => {
    const result = await createCheckout({
      data: { priceId, returnUrl, environment: getStripeEnvironment() },
    });
    if ("error" in result) throw new Error(result.error);
    if (!result.clientSecret) throw new Error("Checkout could not be started");
    return result.clientSecret;
  };

  return (
    <div id="checkout">
      <EmbeddedCheckoutProvider stripe={getStripe()} options={{ fetchClientSecret }}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}
