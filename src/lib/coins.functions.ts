import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getBalanceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getBalance } = await import("@/server/coins.server");
    const balance = await getBalance(context.userId as string);
    return { balance };
  });

export const claimAdRewardFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { claimAdReward } = await import("@/server/coins.server");
    const { balance, reward } = await claimAdReward(context.userId as string);
    return { balance, reward };
  });

