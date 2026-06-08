// Server-only coin economy helpers.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const LOBBY_COST = 24;
export const AD_REWARD = 5;
export const AD_COOLDOWN_SECONDS = 30;
export const AD_DAILY_CAP = 20;

export const COIN_PACKAGES: Record<string, { coins: number; priceUsd: number; label: string }> = {
  starter: { coins: 100, priceUsd: 0.99, label: "Starter" },
  popular: { coins: 250, priceUsd: 1.99, label: "Popular" },
  value: { coins: 500, priceUsd: 3.49, label: "Value" },
  pro: { coins: 1000, priceUsd: 5.99, label: "Pro" },
};

export const SIGNUP_BONUS = 50;

export async function getBalance(userId: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from("wallets")
    .select("balance")
    .eq("user_id", userId)
    .maybeSingle();
  if (data) return data.balance as number;
  // First time we see this user — grant the signup bonus.
  const { data: inserted } = await supabaseAdmin
    .from("wallets")
    .insert({ user_id: userId, balance: SIGNUP_BONUS })
    .select("balance")
    .single();
  await supabaseAdmin.from("coin_transactions").insert({
    user_id: userId,
    delta: SIGNUP_BONUS,
    reason: "signup_bonus",
  });
  return (inserted?.balance as number) ?? SIGNUP_BONUS;
}

export async function creditCoins(
  userId: string,
  amount: number,
  reason: string,
  metadata: Record<string, unknown> = {},
): Promise<number> {
  const { data, error } = await supabaseAdmin.rpc("credit_coins", {
    _user_id: userId,
    _amount: amount,
    _reason: reason,
    _meta: metadata as never,
  });
  if (error) throw error;
  return data as number;
}

export async function spendCoins(
  userId: string,
  amount: number,
  reason: string,
  metadata: Record<string, unknown> = {},
): Promise<number> {
  const { data, error } = await supabaseAdmin.rpc("spend_coins", {
    _user_id: userId,
    _amount: amount,
    _reason: reason,
    _meta: metadata as never,
  });
  if (error) {
    if (error.message?.includes("INSUFFICIENT_FUNDS")) {
      throw new Error("INSUFFICIENT_FUNDS");
    }
    throw error;
  }
  return data as number;
}

export async function claimAdReward(userId: string): Promise<{ balance: number; reward: number }> {
  const since = new Date(Date.now() - AD_COOLDOWN_SECONDS * 1000).toISOString();
  const { data: recent } = await supabaseAdmin
    .from("ad_rewards")
    .select("id, created_at")
    .eq("user_id", userId)
    .gt("created_at", since)
    .limit(1);
  if (recent && recent.length > 0) {
    throw new Error("COOLDOWN");
  }
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabaseAdmin
    .from("ad_rewards")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gt("created_at", dayAgo);
  if ((count ?? 0) >= AD_DAILY_CAP) {
    throw new Error("DAILY_CAP");
  }
  await supabaseAdmin.from("ad_rewards").insert({ user_id: userId });
  const balance = await creditCoins(userId, AD_REWARD, "ad_reward");
  return { balance, reward: AD_REWARD };
}

export async function purchaseCoins(
  userId: string,
  packageId: string,
): Promise<{ balance: number; coins: number }> {
  const pkg = COIN_PACKAGES[packageId];
  if (!pkg) throw new Error("Unknown package");
  // Placeholder: real payment integration will verify a payment receipt before crediting.
  const balance = await creditCoins(userId, pkg.coins, "purchase", { packageId });
  return { balance, coins: pkg.coins };
}
