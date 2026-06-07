import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();
const nickname = z.string().trim().min(1).max(24);
const country = z.string().trim().max(64).default("");
const gender = z.enum(["male", "female", "nonbinary", "unspecified"]).default("unspecified");
const avatarUrl = z.string().trim().max(500).default("");
const lobby = z.enum(["any", "girls", "boys"]).default("any");

const profileSchema = z.object({
  nickname,
  country,
  gender,
  avatarUrl,
});

export const joinQueueFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({ clientId: uuid, profile: profileSchema, lobby }).parse,
  )
  .handler(async ({ data, context }) => {
    const { joinQueueAndTryMatch } = await import("@/server/matchmaking.server");
    return joinQueueAndTryMatch(data.clientId, data.profile, data.lobby, context.userId as string);
  });

export const decideFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      sessionId: uuid,
      clientId: uuid,
      decision: z.enum(["accept", "skip"]),
    }).parse,
  )
  .handler(async ({ data }) => {
    const { applyDecision } = await import("@/server/matchmaking.server");
    return applyDecision(data.sessionId, data.clientId, data.decision);
  });

export const enforceTimeoutFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ sessionId: uuid }).parse)
  .handler(async ({ data }) => {
    const { enforceTimeout } = await import("@/server/matchmaking.server");
    return enforceTimeout(data.sessionId);
  });

export const leaveSessionFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ sessionId: uuid, clientId: uuid }).parse)
  .handler(async ({ data }) => {
    const { leaveSession } = await import("@/server/matchmaking.server");
    await leaveSession(data.sessionId, data.clientId);
    return { ok: true };
  });

export const sendMessageFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      sessionId: uuid,
      clientId: uuid,
      content: z.string().trim().min(1).max(1000),
    }).parse,
  )
  .handler(async ({ data }) => {
    const { sendMessage } = await import("@/server/matchmaking.server");
    await sendMessage(data.sessionId, data.clientId, data.content);
    return { ok: true };
  });

export const leaveQueueFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ clientId: uuid }).parse)
  .handler(async ({ data, context }) => {
    const { leaveQueue } = await import("@/server/matchmaking.server");
    await leaveQueue(data.clientId, context.userId as string);
    return { ok: true };
  });

export const findActiveSessionFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ clientId: uuid }).parse)
  .handler(async ({ data }) => {
    const { findActiveSession } = await import("@/server/matchmaking.server");
    const session = await findActiveSession(data.clientId);
    return { session };
  });

export const reportPartnerFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      sessionId: uuid,
      clientId: uuid,
      reason: z.string().trim().min(1).max(64),
      details: z.string().trim().max(1000).default(""),
      alsoBlock: z.boolean().default(true),
    }).parse,
  )
  .handler(async ({ data }) => {
    const { reportPartner } = await import("@/server/matchmaking.server");
    await reportPartner({
      sessionId: data.sessionId,
      reporterClientId: data.clientId,
      reason: data.reason,
      details: data.details,
      alsoBlock: data.alsoBlock,
    });
    return { ok: true };
  });

export const blockPartnerFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ sessionId: uuid, clientId: uuid }).parse)
  .handler(async ({ data }) => {
    const { blockPartner } = await import("@/server/matchmaking.server");
    return blockPartner(data.sessionId, data.clientId);
  });

export const createAvatarUploadUrlFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      clientId: uuid,
      ext: z.string().trim().min(1).max(8),
    }).parse,
  )
  .handler(async ({ data }) => {
    const { createAvatarUploadUrl } = await import("@/server/matchmaking.server");
    return createAvatarUploadUrl(data.clientId, data.ext);
  });

export const addFriendFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      sessionId: uuid,
      clientId: uuid,
      profile: profileSchema,
    }).parse,
  )
  .handler(async ({ data }) => {
    const { addFriend } = await import("@/server/matchmaking.server");
    return addFriend(data.sessionId, data.clientId, data.profile);
  });

export const listFriendsFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ clientId: uuid }).parse)
  .handler(async ({ data }) => {
    const { listFriends } = await import("@/server/matchmaking.server");
    const friends = await listFriends(data.clientId);
    return { friends };
  });

export const removeFriendFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ clientId: uuid, otherId: uuid }).parse)
  .handler(async ({ data }) => {
    const { removeFriend } = await import("@/server/matchmaking.server");
    await removeFriend(data.clientId, data.otherId);
    return { ok: true };
  });

export const sendFriendMessageFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      clientId: uuid,
      otherId: uuid,
      content: z.string().trim().min(1).max(1000),
    }).parse,
  )
  .handler(async ({ data }) => {
    const { sendFriendMessage } = await import("@/server/matchmaking.server");
    await sendFriendMessage(data.clientId, data.otherId, data.content);
    return { ok: true };
  });

export const listFriendMessagesFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ clientId: uuid, otherId: uuid }).parse)
  .handler(async ({ data }) => {
    const { listFriendMessages } = await import("@/server/matchmaking.server");
    const messages = await listFriendMessages(data.clientId, data.otherId);
    return { messages };
  });
