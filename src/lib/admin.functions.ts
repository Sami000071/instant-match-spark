import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Response("Forbidden", { status: 403 });
  return supabaseAdmin;
}

export const isAdminFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      await assertAdmin(context.userId as string);
      return { admin: true };
    } catch {
      return { admin: false };
    }
  });

export type ReportRow = {
  id: string;
  created_at: string;
  reason: string;
  details: string;
  session_id: string | null;
  reporter_client_id: string;
  reported_client_id: string;
  reporter: { nickname: string; country: string; age: number | null } | null;
  reported: { nickname: string; country: string; age: number | null } | null;
};

export const listReportsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ReportRow[]> => {
    const admin = await assertAdmin(context.userId as string);
    const { data: reports, error } = await admin
      .from("reports")
      .select("id, created_at, reason, details, session_id, reporter_client_id, reported_client_id")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    const ids = Array.from(
      new Set((reports ?? []).flatMap((r) => [r.reporter_client_id, r.reported_client_id])),
    );
    const { data: profiles } = await admin
      .from("profiles")
      .select("client_id, nickname, country, age")
      .in("client_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
    const byClient = new Map((profiles ?? []).map((p) => [p.client_id, p]));
    return (reports ?? []).map((r) => ({
      ...r,
      reporter: byClient.get(r.reporter_client_id) ?? null,
      reported: byClient.get(r.reported_client_id) ?? null,
    })) as ReportRow[];
  });

export type TranscriptMessage = {
  id: string;
  content: string;
  created_at: string;
  sender_client_id: string;
  senderNickname: string;
  isReported: boolean;
};

export const getReportTranscriptFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { reportId: string }) => {
    if (!data || typeof data.reportId !== "string") throw new Error("reportId required");
    return { reportId: data.reportId };
  })
  .handler(async ({ context, data }): Promise<TranscriptMessage[]> => {
    const admin = await assertAdmin(context.userId as string);
    const { data: report, error } = await admin
      .from("reports")
      .select("session_id, reported_client_id")
      .eq("id", data.reportId)
      .maybeSingle();
    if (error) throw error;
    if (!report?.session_id) return [];
    const { data: messages } = await admin
      .from("messages")
      .select("id, content, created_at, sender_client_id")
      .eq("session_id", report.session_id)
      .order("created_at", { ascending: true });
    const ids = Array.from(new Set((messages ?? []).map((m) => m.sender_client_id)));
    const { data: profiles } = await admin
      .from("profiles")
      .select("client_id, nickname")
      .in("client_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
    const names = new Map((profiles ?? []).map((p) => [p.client_id, p.nickname]));
    return (messages ?? []).map((m) => ({
      ...m,
      senderNickname: names.get(m.sender_client_id) || "Anonymous",
      isReported: m.sender_client_id === report.reported_client_id,
    }));
  });
