import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inputSchema = z.object({
  priceId: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  returnUrl: z.string().url(),
  environment: z.enum(["sandbox", "live"]),
});

type CheckoutResult = { clientSecret: string } | { error: string };

export const createCoinCheckoutFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(inputSchema.parse)
  .handler(async ({ data, context }): Promise<CheckoutResult> => {
    const { createCoinCheckoutSession } = await import("@/server/payments.server");
    const { supabase, userId } = context;
    const { data: userData } = await supabase.auth.getUser();
    return createCoinCheckoutSession({
      priceId: data.priceId,
      returnUrl: data.returnUrl,
      environment: data.environment,
      userId: userId as string,
      email: userData?.user?.email ?? undefined,
    });
  });
