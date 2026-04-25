import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  applyDecision,
  enforceTimeout,
  joinQueueAndTryMatch,
  leaveQueue,
  leaveSession,
  sendMessage,
} from "./matchmaking.server";

const uuid = z.string().uuid();
const nickname = z.string().trim().min(1).max(24);
const interests = z.array(z.string().trim().min(1).max(24)).max(8);
const gender = z.enum(["male", "female", "unspecified"]);
const country = z.string().trim().max(8);

export const joinQueueFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({ clientId: uuid, nickname, interests, gender, country }).parse,
  )
  .handler(async ({ data }) => {
    return joinQueueAndTryMatch(
      data.clientId,
      data.nickname,
      data.interests,
      data.gender,
      data.country,
    );
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
