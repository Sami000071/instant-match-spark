// Server-only helpers for matchmaking. Never imported from client code.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";

type SessionUpdate = Database["public"]["Tables"]["match_sessions"]["Update"];

const DECIDE_WINDOW_MS = 5000;

export type Gender = "male" | "female" | "unspecified";

export type MatchSession = {
  id: string;
  user_a_client_id: string;
  user_a_nickname: string;
  user_a_interests: string[];
  user_a_gender: Gender;
  user_a_country: string;
  user_b_client_id: string;
  user_b_nickname: string;
  user_b_interests: string[];
  user_b_gender: Gender;
  user_b_country: string;
  user_a_decision: "pending" | "accept" | "skip";
  user_b_decision: "pending" | "accept" | "skip";
  status: "deciding" | "chatting" | "ended";
  decide_deadline: string;
  ended_reason: string | null;
  left_by: string | null;
  created_at: string;
};

// Remove user from queue and end any active session they're in.
export async function clearUserState(clientId: string, reason: string) {
  await supabaseAdmin.from("queue").delete().eq("client_id", clientId);

  const { data: sessions } = await supabaseAdmin
    .from("match_sessions")
    .select("*")
    .or(`user_a_client_id.eq.${clientId},user_b_client_id.eq.${clientId}`)
    .in("status", ["deciding", "chatting"]);

  if (sessions && sessions.length > 0) {
    await supabaseAdmin
      .from("match_sessions")
      .update({ status: "ended", ended_reason: reason, left_by: clientId })
      .in(
        "id",
        sessions.map((s) => s.id),
      );
  }
}

// Try to pair the given user with another waiting user. If none, insert into queue.
export async function joinQueueAndTryMatch(
  clientId: string,
  nickname: string,
  interests: string[],
): Promise<{ session: MatchSession | null }> {
  // Clean up any prior state first
  await clearUserState(clientId, "rejoined");

  // Find another waiter (oldest first)
  const { data: waiters } = await supabaseAdmin
    .from("queue")
    .select("*")
    .neq("client_id", clientId)
    .order("created_at", { ascending: true })
    .limit(1);

  if (waiters && waiters.length > 0) {
    const partner = waiters[0];
    // Atomically remove the partner from queue (only succeeds if still there)
    const { data: removed } = await supabaseAdmin
      .from("queue")
      .delete()
      .eq("id", partner.id)
      .select();

    if (removed && removed.length > 0) {
      const deadline = new Date(Date.now() + DECIDE_WINDOW_MS).toISOString();
      const { data: session, error } = await supabaseAdmin
        .from("match_sessions")
        .insert({
          user_a_client_id: partner.client_id,
          user_a_nickname: partner.nickname,
          user_a_interests: partner.interests,
          user_b_client_id: clientId,
          user_b_nickname: nickname,
          user_b_interests: interests,
          decide_deadline: deadline,
        })
        .select()
        .single();
      if (error) throw error;
      return { session: session as MatchSession };
    }
  }

  // Otherwise, add self to queue
  await supabaseAdmin
    .from("queue")
    .insert({ client_id: clientId, nickname, interests });
  return { session: null };
}

// Apply a decision. If both accepted -> chatting. If any skip or deadline passed -> ended.
export async function applyDecision(
  sessionId: string,
  clientId: string,
  decision: "accept" | "skip",
): Promise<MatchSession> {
  const { data: session, error } = await supabaseAdmin
    .from("match_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();
  if (error || !session) throw new Error("Session not found");

  const isA = session.user_a_client_id === clientId;
  const isB = session.user_b_client_id === clientId;
  if (!isA && !isB) throw new Error("Not a participant");

  if (session.status !== "deciding") return session as MatchSession;

  const update: SessionUpdate = {};
  if (isA) update.user_a_decision = decision;
  else update.user_b_decision = decision;

  const aDec = isA ? decision : session.user_a_decision;
  const bDec = isB ? decision : session.user_b_decision;
  const deadlinePassed = Date.now() > new Date(session.decide_deadline).getTime();

  if (decision === "skip") {
    update.status = "ended";
    update.ended_reason = "skipped";
    update.left_by = clientId;
  } else if (aDec === "accept" && bDec === "accept") {
    update.status = "chatting";
  } else if (deadlinePassed) {
    update.status = "ended";
    update.ended_reason = "timeout";
  }

  const { data: updated, error: uErr } = await supabaseAdmin
    .from("match_sessions")
    .update(update)
    .eq("id", sessionId)
    .select()
    .single();
  if (uErr) throw uErr;
  return updated as MatchSession;
}

// Called periodically by clients during deciding phase. Ends session if deadline passed
// without both accepts.
export async function enforceTimeout(sessionId: string): Promise<MatchSession | null> {
  const { data: session } = await supabaseAdmin
    .from("match_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();
  if (!session) return null;
  if (session.status !== "deciding") return session as MatchSession;

  const deadlinePassed = Date.now() > new Date(session.decide_deadline).getTime();
  if (!deadlinePassed) return session as MatchSession;

  const both = session.user_a_decision === "accept" && session.user_b_decision === "accept";
  const update: SessionUpdate = both
    ? { status: "chatting" }
    : { status: "ended", ended_reason: "timeout" };

  const { data: updated } = await supabaseAdmin
    .from("match_sessions")
    .update(update)
    .eq("id", sessionId)
    .select()
    .single();
  return (updated as MatchSession) ?? null;
}

export async function leaveSession(sessionId: string, clientId: string) {
  await supabaseAdmin
    .from("match_sessions")
    .update({ status: "ended", ended_reason: "left", left_by: clientId })
    .eq("id", sessionId)
    .in("status", ["deciding", "chatting"]);
}

export async function sendMessage(sessionId: string, clientId: string, content: string) {
  const { data: session } = await supabaseAdmin
    .from("match_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();
  if (!session) throw new Error("Session not found");
  if (session.status !== "chatting") throw new Error("Not in chat");
  if (
    session.user_a_client_id !== clientId &&
    session.user_b_client_id !== clientId
  ) {
    throw new Error("Not a participant");
  }
  const trimmed = content.trim().slice(0, 1000);
  if (!trimmed) throw new Error("Empty message");

  const { error } = await supabaseAdmin.from("messages").insert({
    session_id: sessionId,
    sender_client_id: clientId,
    content: trimmed,
  });
  if (error) throw error;
}

export async function leaveQueue(clientId: string) {
  await supabaseAdmin.from("queue").delete().eq("client_id", clientId);
}
