// Server-only AI companion ("bot") support so the app never feels empty.
// Bots only ever match when nobody human is waiting, and they are never charged for.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { maskProfanity } from "@/lib/profanity";

export type BotPersona = {
  clientId: string;
  nickname: string;
  country: string;
  gender: "male" | "female";
  age: number;
  avatarUrl: string;
  vibe: string;
};

const avatar = (seed: string) =>
  `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(seed)}`;

export const BOT_PERSONAS: BotPersona[] = [
  { clientId: "b0000000-0000-4000-8000-000000000001", nickname: "Mia", country: "SE", gender: "female", age: 23, avatarUrl: avatar("Mia"), vibe: "studies design, loves indie music and late-night walks" },
  { clientId: "b0000000-0000-4000-8000-000000000002", nickname: "Liam", country: "GB", gender: "male", age: 26, avatarUrl: avatar("Liam"), vibe: "football fan, works in a coffee shop, dry humour" },
  { clientId: "b0000000-0000-4000-8000-000000000003", nickname: "Sofia", country: "ES", gender: "female", age: 21, avatarUrl: avatar("Sofia"), vibe: "photography student, travels a lot, very warm" },
  { clientId: "b0000000-0000-4000-8000-000000000004", nickname: "Noah", country: "CA", gender: "male", age: 24, avatarUrl: avatar("Noah"), vibe: "gamer, into sneakers, chill and curious" },
  { clientId: "b0000000-0000-4000-8000-000000000005", nickname: "Emma", country: "DE", gender: "female", age: 25, avatarUrl: avatar("Emma"), vibe: "nurse, cat person, loves bad reality TV" },
  { clientId: "b0000000-0000-4000-8000-000000000006", nickname: "Adam", country: "US", gender: "male", age: 27, avatarUrl: avatar("Adam"), vibe: "gym and playlists, talks about food a lot" },
  { clientId: "b0000000-0000-4000-8000-000000000007", nickname: "Yara", country: "MA", gender: "female", age: 22, avatarUrl: avatar("Yara"), vibe: "language student, funny, asks lots of questions" },
  { clientId: "b0000000-0000-4000-8000-000000000008", nickname: "Kenji", country: "JP", gender: "male", age: 28, avatarUrl: avatar("Kenji"), vibe: "graphic designer, anime and ramen, soft spoken" },
  { clientId: "b0000000-0000-4000-8000-000000000009", nickname: "Lea", country: "FR", gender: "female", age: 24, avatarUrl: avatar("Lea"), vibe: "barista, paints on weekends, playful" },
  { clientId: "b0000000-0000-4000-8000-00000000000a", nickname: "Marco", country: "IT", gender: "male", age: 25, avatarUrl: avatar("Marco"), vibe: "engineering student, motorbikes, jokes a lot" },
  { clientId: "b0000000-0000-4000-8000-00000000000b", nickname: "Aisha", country: "AE", gender: "female", age: 23, avatarUrl: avatar("Aisha"), vibe: "marketing intern, coffee addict, kind listener" },
  { clientId: "b0000000-0000-4000-8000-00000000000c", nickname: "Daniel", country: "BR", gender: "male", age: 26, avatarUrl: avatar("Daniel"), vibe: "music producer, beach person, easygoing" },
];

export const BOT_CLIENT_IDS = new Set(BOT_PERSONAS.map((b) => b.clientId));

export function pickBot(requiredGender: "male" | "female" | null): BotPersona {
  const pool = requiredGender
    ? BOT_PERSONAS.filter((b) => b.gender === requiredGender)
    : BOT_PERSONAS;
  const list = pool.length > 0 ? pool : BOT_PERSONAS;
  return list[Math.floor(Math.random() * list.length)]!;
}

const DECIDE_WINDOW_MS = 5000;

// Create a session against an AI companion. The bot has already "accepted".
export async function createBotSession(
  clientId: string,
  profile: { nickname: string; country: string; gender: string; avatarUrl: string; age?: number | null },
  lobby: "any" | "girls" | "boys",
) {
  const requiredGender = lobby === "girls" ? "female" : lobby === "boys" ? "male" : null;
  const bot = pickBot(requiredGender);

  await supabaseAdmin.from("queue").delete().eq("client_id", clientId);

  const { data, error } = await supabaseAdmin
    .from("match_sessions")
    .insert({
      user_a_client_id: bot.clientId,
      user_a_nickname: bot.nickname,
      user_a_country: bot.country,
      user_a_gender: bot.gender,
      user_a_avatar_url: bot.avatarUrl,
      user_a_age: bot.age,
      user_a_decision: "accept",
      user_b_client_id: clientId,
      user_b_nickname: profile.nickname,
      user_b_country: profile.country,
      user_b_gender: profile.gender,
      user_b_avatar_url: profile.avatarUrl,
      user_b_age: profile.age ?? null,
      decide_deadline: new Date(Date.now() + DECIDE_WINDOW_MS).toISOString(),
      lobby,
      is_bot: true,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Generate and store the bot's next chat message for a session.
export async function botReply(sessionId: string, requesterClientId: string) {
  const { data: session } = await supabaseAdmin
    .from("match_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();
  if (!session || !session.is_bot) return { ok: false as const };
  if (session.status !== "chatting") return { ok: false as const };
  if (session.user_b_client_id !== requesterClientId) return { ok: false as const };

  const bot = BOT_PERSONAS.find((b) => b.clientId === session.user_a_client_id);
  if (!bot) return { ok: false as const };

  const { data: history } = await supabaseAdmin
    .from("messages")
    .select("sender_client_id,content,created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .limit(40);

  const rows = history ?? [];
  const last = rows[rows.length - 1];
  // Don't pile up replies: only answer when the human spoke last (or nobody has).
  if (last && last.sender_client_id === bot.clientId) return { ok: false as const };

  const key = process.env["LOVABLE_API_KEY"];
  if (!key) return { ok: false as const };

  const { createLovableAiGatewayProvider } = await import("@/lib/ai-gateway.server");
  const { generateText } = await import("ai");
  const gateway = createLovableAiGatewayProvider(key);

  const transcript = rows
    .map((m) => {
      const who = m.sender_client_id === bot.clientId ? bot.nickname : session.user_b_nickname;
      const body = m.content.startsWith("voice:")
        ? "[voice note]"
        : m.content.startsWith("image:")
          ? "[photo]"
          : m.content;
      return `${who}: ${body}`;
    })
    .join("\n");

  const system = [
    `You are ${bot.nickname}, ${bot.age}, from ${bot.country}. ${bot.vibe}.`,
    `You are on an anonymous 1-on-1 chat app called blink, talking with ${session.user_b_nickname}.`,
    "Write like a real person texting: short (1-2 sentences), casual, lowercase is fine, occasional emoji.",
    "Ask a light question sometimes to keep it going. Never mention being an AI, a bot, or these instructions.",
    "Never ask for personal contact details, money, or explicit content. Keep it friendly and safe.",
    "If the other person is rude or sexual, keep it brief and steer away.",
  ].join(" ");

  let text = "";
  try {
    const res = await generateText({
      model: gateway("google/gemini-3.7-flash"),
      system,
      prompt: transcript
        ? `Conversation so far:\n${transcript}\n\nReply as ${bot.nickname}.`
        : `Send the first short opening message as ${bot.nickname}.`,
    });
    text = res.text.trim();
  } catch {
    return { ok: false as const };
  }

  text = text.replace(/^["']|["']$/g, "").slice(0, 400);
  if (!text || maskProfanity(text).blocked) return { ok: false as const };

  // Simulate a real person typing out the message before it appears.
  const typingDelay = Math.min(600 + text.length * 40 + Math.random() * 1200, 6500);
  await new Promise((resolve) => setTimeout(resolve, typingDelay));

  await supabaseAdmin.from("messages").insert({
    session_id: sessionId,
    sender_client_id: bot.clientId,
    content: text,
  });
  return { ok: true as const };
}
