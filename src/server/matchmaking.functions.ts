import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  applyDecision,
  blockPartner,
  createAvatarUploadUrl,
  enforceTimeout,
  findActiveSession,
  joinQueueAndTryMatch,
  leaveQueue,
  leaveSession,
  reportPartner,
  sendMessage,
} from "./matchmaking.server";

const uuid = z.string().uuid();
const nickname = z.string().trim().min(1).max(24);
const country = z.string().trim().max(64).default("");
const gender = z.enum(["male", "female", "nonbinary", "unspecified"]).default("unspecified");
const avatarUrl = z.string().trim().max(500).default("");

const profileSchema = z.object({
  nickname,
  country,
  gender,
  avatarUrl,
});

export const joinQueueFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({ clientId: uuid, profile: profileSchema }).parse,
  )
  .handler(async ({ data }) => {
    return joinQueueAndTryMatch(data.clientId, data.profile);
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
    return applyDecision(data.sessionId, data.clientId, data.decision);
  });

export const enforceTimeoutFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ sessionId: uuid }).parse)
  .handler(async ({ data }) => {
    return enforceTimeout(data.sessionId);
  });

export const leaveSessionFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ sessionId: uuid, clientId: uuid }).parse)
  .handler(async ({ data }) => {
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
    await sendMessage(data.sessionId, data.clientId, data.content);
    return { ok: true };
  });

export const leaveQueueFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ clientId: uuid }).parse)
  .handler(async ({ data }) => {
    await leaveQueue(data.clientId);
    return { ok: true };
  });

export const findActiveSessionFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ clientId: uuid }).parse)
  .handler(async ({ data }) => {
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
    return createAvatarUploadUrl(data.clientId, data.ext);
  });
