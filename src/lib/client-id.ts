// Stable per-browser anonymous client id (UUID), kept in localStorage.
const KEY = "blink_chat_client_id";

export function getClientId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}

const PROFILE_KEY = "blink_chat_profile";

export type Gender = "boy" | "girl" | "unspecified";

export type Profile = {
  nickname: string;
  gender: Gender;
  country: string; // ISO code, e.g. "US"
  interests: string[]; // kept for backwards compat, unused
};

export function loadProfile(): Profile | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(PROFILE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Profile>;
    return {
      nickname: parsed.nickname ?? "",
      gender: (parsed.gender as Gender) ?? "unspecified",
      country: parsed.country ?? "",
      interests: parsed.interests ?? [],
    };
  } catch {
    return null;
  }
}

export function saveProfile(p: Profile) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
}
