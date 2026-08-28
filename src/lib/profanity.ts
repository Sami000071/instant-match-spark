// Shared word-filter ("observer") used for nicknames and chat messages.
// Runs on the client for instant feedback AND on the server as the source
// of truth, so a modified client cannot bypass it.

const BAD_WORDS = [
  // sexual / explicit
  "fuck", "fuk", "fuq", "fck", "phuck", "motherfucker", "mofucker",
  "shit", "shyt", "bullshit", "crap",
  "bitch", "biatch", "btch", "whore", "hoe", "slut", "skank",
  "cunt", "twat", "pussy", "pusy", "dick", "dik", "cock", "penis",
  "vagina", "boobs", "tits", "titties", "anal", "anus", "asshole",
  "arsehole", "bastard", "wanker", "jerkoff", "handjob", "blowjob",
  "cum", "jizz", "semen", "sperm", "orgasm", "masturbate", "porn",
  "porno", "xxx", "hentai", "nude", "nudes", "naked", "sex", "sexo",
  "sexting", "horny", "milf", "dildo", "fetish", "escort", "prostitute",
  "rape", "rapist", "molest", "incest", "pedo", "pedophile", "paedo",
  "loli", "cp", "childporn",
  // slurs / hate
  "nigger", "nigga", "niger", "chink", "spic", "kike", "gook", "wetback",
  "coon", "tranny", "faggot", "fagot", "fag", "dyke", "retard", "retarded",
  "nazi", "hitler", "kkk", "jihadi", "terrorist",
  // violence / self-harm
  "kill yourself", "kys", "suicide", "behead", "murder", "genocide",
  // impersonation / scam
  "admin", "moderator", "support", "official", "blinkstaff",
];

// Words that must only match as a standalone token (too many false positives
// otherwise: "class", "grass", "Cummings", "Essex"...).
const STRICT_TOKENS = new Set(["cum", "cp", "fag", "hoe", "sex", "anal", "cock", "dick", "admin", "support", "official", "moderator"]);

const LEET: Record<string, string> = {
  "0": "o", "1": "i", "!": "i", "3": "e", "4": "a", "@": "a",
  "5": "s", "$": "s", "7": "t", "8": "b", "9": "g", "|": "i",
};

/** Lowercase, de-leet, strip separators so "f.u_c k" -> "fuck". */
export function normalizeForFilter(input: string): string {
  const lowered = input.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const deleet = lowered.replace(/[01!34@5$789|]/g, (c) => LEET[c] ?? c);
  return deleet.replace(/[^a-z ]+/g, "");
}

function collapseRepeats(s: string): string {
  return s.replace(/(.)\1{2,}/g, "$1$1");
}

/** Returns the first banned word found, or null. */
export function findProfanity(input: string): string | null {
  if (!input) return null;
  const normalized = collapseRepeats(normalizeForFilter(input));
  const squished = normalized.replace(/ /g, "");
  const tokens = normalized.split(/\s+/).filter(Boolean);
  for (const word of BAD_WORDS) {
    const w = word.replace(/[^a-z ]/g, "");
    if (!w) continue;
    if (w.includes(" ")) {
      if (normalized.includes(w) || squished.includes(w.replace(/ /g, ""))) return word;
      continue;
    }
    if (STRICT_TOKENS.has(w)) {
      if (tokens.includes(w)) return word;
      continue;
    }
    if (squished.includes(w)) return word;
  }
  return null;
}

export function containsProfanity(input: string): boolean {
  return findProfanity(input) !== null;
}

/** Nickname rule: no profanity, no impersonation, printable characters only. */
export function validateNickname(raw: string): { ok: boolean; reason?: string } {
  const name = raw.trim();
  if (name.length < 1 || name.length > 24) {
    return { ok: false, reason: "Name must be 1–24 characters." };
  }
  if (!/^[\p{L}\p{N} _.\-']+$/u.test(name)) {
    return { ok: false, reason: "Name can only use letters, numbers, spaces, . _ - '" };
  }
  if (containsProfanity(name)) {
    return { ok: false, reason: "That name isn't allowed. Please choose another one." };
  }
  return { ok: true };
}

/** Replace banned words in a message with asterisks, keeping the rest intact. */
export function maskProfanity(text: string): { clean: string; blocked: boolean } {
  let blocked = false;
  const clean = text.replace(/[\p{L}\p{N}\p{P}\p{S}]+/gu, (token) => {
    if (containsProfanity(token)) {
      blocked = true;
      return "*".repeat(Math.min(token.length, 8));
    }
    return token;
  });
  // Catch phrases split across tokens (e.g. "kill yourself").
  if (!blocked && containsProfanity(text)) {
    blocked = true;
    return { clean: "*****", blocked };
  }
  return { clean, blocked };
}
