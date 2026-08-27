import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const deleteAccountFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = context.userId as string;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Clean up user-owned rows that may not cascade automatically.
    await supabaseAdmin.from("wallets").delete().eq("user_id", userId);
    await supabaseAdmin.from("coin_transactions").delete().eq("user_id", userId);
    await supabaseAdmin.from("ad_rewards").delete().eq("user_id", userId);
    await supabaseAdmin.from("profiles").delete().eq("user_id", userId);

    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) throw error;
    return { ok: true };
  });
