// Server-only helpers for matchmaking. Never imported from client code.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import { LOBBY_COST, creditCoins, spendCoins } from "./coins.server";

type SessionUpdate = Database["public"]["Tables"]["match_sessions"]["Update"];

const DECIDE_WINDOW_MS = 5000;
export type Lobby = "any" | "girls" | "boys";

function lobbyRequiresGender(lobby: Lobby): "female" | "male" | null {
  if (lobby === "girls") return "female";
  if (lobby === "boys") return "male";
  return null;
}

export type MatchSession = {
  id: string;
  user_a_client_id: string;
  user_a_nickname: string;
  user_a_country: string;
  user_a_gender: string;
  user_a_avatar_url: string;
  user_b_client_id: string;
  user_b_nickname: string;
  user_b_country: string;
  user_b_gender: string;
  user_b_avatar_url: string;
  user_a_decision: "pending" | "accept" | "skip";
  user_b_decision: "pending" | "accept" | "skip";
  status: "deciding" | "chatting" | "ended";
  decide_deadline: string;
  ended_reason: string | null;
  left_by: string | null;
  created_at: string;
};

export type Profile = {
  nickname: string;
  country: string;
  gender: string;
  avatarUrl: string;
};

// Remove user from queue and end any active session they're in.
export async function clearUserState(clientId: string, reason: string) {
  await supabaseAdmin.from("queue").delete().eq("client_id", clientId);

  const { data: sessions } = await supabaseAdmin
    .from("match_sessions")
    .select("id")
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

// Find an active session this client is in (for reconnect).
export async function findActiveSession(clientId: string): Promise<MatchSession | null> {
  const { data } = await supabaseAdmin
    .from("match_sessions")
    .select("*")
    .or(`user_a_client_id.eq.${clientId},user_b_client_id.eq.${clientId}`)
    .in("status", ["deciding", "chatting"])
    .order("created_at", { ascending: false })
    .limit(1);
  return (data?.[0] as MatchSession) ?? null;
}

async function getBlockedSet(clientId: string): Promise<Set<string>> {
  // Both directions: people I blocked, AND people who blocked me.
  const [{ data: a }, { data: b }] = await Promise.all([
    supabaseAdmin.from("blocks").select("blocked_client_id").eq("blocker_client_id", clientId),
    supabaseAdmin.from("blocks").select("blocker_client_id").eq("blocked_client_id", clientId),
  ]);
  const set = new Set<string>();
  a?.forEach((r) => set.add(r.blocked_client_id));
  b?.forEach((r) => set.add(r.blocker_client_id));
  return set;
}

// Try to pair the given user with another waiting user. If none, insert into queue.
export async function joinQueueAndTryMatch(
  clientId: string,
  profile: Profile,
  lobby: Lobby = "any",
  authUserId: string | null = null,
): Promise<{ session: MatchSession | null; charged?: number; balance?: number }> {
  // Reconnect path: if already in an active session, return it.
  const existing = await findActiveSession(clientId);
  if (existing) return { session: existing };

  // Premium lobbies require auth but coins are only charged upon an actual match.
  let charged = 0;
  let balance: number | undefined;
  if (lobby !== "any" && !authUserId) throw new Error("AUTH_REQUIRED");

  // Clean up any prior queue entries first
  await supabaseAdmin.from("queue").delete().eq("client_id", clientId);

  const blocked = await getBlockedSet(clientId);

  // Find another waiter, filtering blocked pairs.
  // Lobby acts as a TARGET-gender filter (not a bucket): a user who picks
  // "boys" wants male partners; a user who picks "girls" wants female partners.
  // Mutual match requires both sides' lobby filters to be satisfied.
  const { data: waiters } = await supabaseAdmin
    .from("queue")
    .select("*")
    .neq("client_id", clientId)
    .order("created_at", { ascending: true })
    .limit(50);

  const myRequiredPartnerGender = lobbyRequiresGender(lobby);
  const partner = waiters?.find((w) => {
    if (blocked.has(w.client_id)) return false;
    if (myRequiredPartnerGender && w.gender !== myRequiredPartnerGender) return false;
    const theirRequired = lobbyRequiresGender((w.lobby ?? "any") as Lobby);
    if (theirRequired && profile.gender !== theirRequired) return false;
    return true;
  });

  if (partner) {
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
          user_a_country: partner.country ?? "",
          user_a_gender: partner.gender ?? "unspecified",
          user_a_avatar_url: partner.avatar_url ?? "",
          user_b_client_id: clientId,
          user_b_nickname: profile.nickname,
          user_b_country: profile.country,
          user_b_gender: profile.gender,
          user_b_avatar_url: profile.avatarUrl,
          decide_deadline: deadline,
          lobby,
        })
        .select()
        .single();
      if (error) throw error;
      return { session: session as MatchSession, charged, balance };
    }
  }

  // Otherwise, add self to queue
  await supabaseAdmin.from("queue").insert({
    client_id: clientId,
    nickname: profile.nickname,
    country: profile.country,
    gender: profile.gender,
    avatar_url: profile.avatarUrl,
    lobby,
  });
  return { session: null, charged, balance };
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
    .select("status,user_a_client_id,user_b_client_id")
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

export async function leaveQueue(clientId: string, authUserId: string | null = null) {
  // If the user was queued in a premium lobby, refund the coin cost.
  const { data: rows } = await supabaseAdmin
    .from("queue")
    .delete()
    .eq("client_id", clientId)
    .select("lobby");
  if (authUserId && rows && rows.length > 0) {
    const lobby = rows[0].lobby as string;
    if (lobby && lobby !== "any") {
      await creditCoins(authUserId, LOBBY_COST, "refund_lobby", { lobby }).catch(() => {});
    }
  }
}

export async function reportPartner(args: {
  sessionId: string;
  reporterClientId: string;
  reason: string;
  details: string;
  alsoBlock: boolean;
}) {
  const { data: session } = await supabaseAdmin
    .from("match_sessions")
    .select("user_a_client_id,user_b_client_id")
    .eq("id", args.sessionId)
    .single();
  if (!session) throw new Error("Session not found");
  const otherId =
    session.user_a_client_id === args.reporterClientId
      ? session.user_b_client_id
      : session.user_a_client_id;

  await supabaseAdmin.from("reports").insert({
    session_id: args.sessionId,
    reporter_client_id: args.reporterClientId,
    reported_client_id: otherId,
    reason: args.reason.slice(0, 64),
    details: args.details.slice(0, 1000),
  });

  if (args.alsoBlock) {
    await supabaseAdmin
      .from("blocks")
      .upsert(
        { blocker_client_id: args.reporterClientId, blocked_client_id: otherId },
        { onConflict: "blocker_client_id,blocked_client_id" },
      );
  }
}

export async function blockPartner(sessionId: string, clientId: string) {
  const { data: session } = await supabaseAdmin
    .from("match_sessions")
    .select("user_a_client_id,user_b_client_id")
    .eq("id", sessionId)
    .single();
  if (!session) throw new Error("Session not found");
  const otherId =
    session.user_a_client_id === clientId
      ? session.user_b_client_id
      : session.user_a_client_id;
  await supabaseAdmin
    .from("blocks")
    .upsert(
      { blocker_client_id: clientId, blocked_client_id: otherId },
      { onConflict: "blocker_client_id,blocked_client_id" },
    );
  return { blockedClientId: otherId };
}

// ─── Friends ──────────────────────────────────────────────────────────────

export type Friend = {
  clientId: string;
  nickname: string;
  avatarUrl: string;
  country: string;
  since: string;
};

function pairOrder(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export async function addFriend(
  sessionId: string,
  clientId: string,
  myProfile: Profile,
): Promise<{ mutual: boolean }> {
  const { data: session } = await supabaseAdmin
    .from("match_sessions")
    .select(
      "user_a_client_id,user_b_client_id,user_a_nickname,user_b_nickname,user_a_avatar_url,user_b_avatar_url,user_a_country,user_b_country",
    )
    .eq("id", sessionId)
    .single();
  if (!session) throw new Error("Session not found");
  const isA = session.user_a_client_id === clientId;
  const isB = session.user_b_client_id === clientId;
  if (!isA && !isB) throw new Error("Not a participant");

  const otherId = isA ? session.user_b_client_id : session.user_a_client_id;
  const otherNick = isA ? session.user_b_nickname : session.user_a_nickname;
  const otherAvatar = isA ? session.user_b_avatar_url : session.user_a_avatar_url;
  const otherCountry = isA ? session.user_b_country : session.user_a_country;

  // Record this user's add request
  await supabaseAdmin
    .from("friend_requests")
    .upsert(
      {
        session_id: sessionId,
        from_client_id: clientId,
        to_client_id: otherId,
        from_nickname: myProfile.nickname,
        from_avatar_url: myProfile.avatarUrl,
        from_country: myProfile.country,
      },
      { onConflict: "session_id,from_client_id" },
    );

  // Check for reverse
  const { data: reverse } = await supabaseAdmin
    .from("friend_requests")
    .select("from_nickname,from_avatar_url,from_country")
    .eq("session_id", sessionId)
    .eq("from_client_id", otherId)
    .eq("to_client_id", clientId)
    .maybeSingle();

  if (!reverse) return { mutual: false };

  // Mutual — create friendship (use canonical pair order)
  const [idA, idB] = pairOrder(clientId, otherId);
  const aIsMe = idA === clientId;
  await supabaseAdmin
    .from("friendships")
    .upsert(
      {
        client_id_a: idA,
        client_id_b: idB,
        nickname_a: aIsMe ? myProfile.nickname : otherNick,
        nickname_b: aIsMe ? otherNick : myProfile.nickname,
        avatar_a: aIsMe ? myProfile.avatarUrl : otherAvatar,
        avatar_b: aIsMe ? otherAvatar : myProfile.avatarUrl,
        country_a: aIsMe ? myProfile.country : otherCountry,
        country_b: aIsMe ? otherCountry : myProfile.country,
      },
      { onConflict: "client_id_a,client_id_b" },
    );

  return { mutual: true };
}

export async function listFriends(clientId: string): Promise<Friend[]> {
  const { data } = await supabaseAdmin
    .from("friendships")
    .select("*")
    .or(`client_id_a.eq.${clientId},client_id_b.eq.${clientId}`)
    .order("created_at", { ascending: false });
  if (!data) return [];
  return data.map((row) => {
    const isA = row.client_id_a === clientId;
    return {
      clientId: isA ? row.client_id_b : row.client_id_a,
      nickname: isA ? row.nickname_b : row.nickname_a,
      avatarUrl: isA ? row.avatar_b : row.avatar_a,
      country: isA ? row.country_b : row.country_a,
      since: row.created_at,
    };
  });
}

export async function removeFriend(clientId: string, otherId: string) {
  const [idA, idB] = pairOrder(clientId, otherId);
  await supabaseAdmin
    .from("friendships")
    .delete()
    .eq("client_id_a", idA)
    .eq("client_id_b", idB);
}

async function assertFriendship(a: string, b: string) {
  const [idA, idB] = pairOrder(a, b);
  const { data } = await supabaseAdmin
    .from("friendships")
    .select("id")
    .eq("client_id_a", idA)
    .eq("client_id_b", idB)
    .maybeSingle();
  if (!data) throw new Error("Not friends");
  return `${idA}:${idB}`;
}

export async function sendFriendMessage(
  fromClientId: string,
  toClientId: string,
  content: string,
) {
  const pairKey = await assertFriendship(fromClientId, toClientId);
  const trimmed = content.trim().slice(0, 1000);
  if (!trimmed) throw new Error("Empty message");
  const { error } = await supabaseAdmin.from("friend_messages").insert({
    pair_key: pairKey,
    from_client_id: fromClientId,
    to_client_id: toClientId,
    content: trimmed,
  });
  if (error) throw error;
}

export async function listFriendMessages(
  clientId: string,
  otherId: string,
) {
  const pairKey = await assertFriendship(clientId, otherId);
  const { data } = await supabaseAdmin
    .from("friend_messages")
    .select("*")
    .eq("pair_key", pairKey)
    .order("created_at", { ascending: true })
    .limit(500);
  return data ?? [];
}

// Generate a signed upload URL for an avatar file.
export async function createAvatarUploadUrl(clientId: string, ext: string) {
  const safeExt = /^(png|jpe?g|webp|gif)$/i.test(ext) ? ext.toLowerCase() : "jpg";
  const path = `${clientId}/${Date.now()}.${safeExt}`;
  const { data, error } = await supabaseAdmin.storage
    .from("avatars")
    .createSignedUploadUrl(path);
  if (error || !data) throw error ?? new Error("Failed to create upload URL");
  const { data: pub } = supabaseAdmin.storage.from("avatars").getPublicUrl(path);
  return { uploadUrl: data.signedUrl, token: data.token, path, publicUrl: pub.publicUrl };
}
