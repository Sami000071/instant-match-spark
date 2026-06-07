import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  AD_REWARD,
  COIN_PACKAGES,
  claimAdReward,
  getBalance,
  purchaseCoins,
} from "@/server/coins.server";

export const getBalanceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const balance = await getBalance(context.userId as string);
    return { balance };
  });

export const claimAdRewardFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { balance, reward } = await claimAdReward(context.userId as string);
    return { balance, reward };
  });

export const purchaseCoinsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ packageId: z.enum(["starter", "popular", "value", "pro"]) }).parse)
  .handler(async ({ data, context }) => {
    const { balance, coins } = await purchaseCoins(context.userId as string, data.packageId);
    return { balance, coins };
  });

export { AD_REWARD, COIN_PACKAGES };
