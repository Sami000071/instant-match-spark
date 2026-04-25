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

export type Gender = "male" | "female" | "unspecified";

export type Profile = {
  nickname: string;
  interests: string[];
  gender: Gender;
  country: string; // ISO code, "" if unset
};

export function loadProfile(): Profile | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(PROFILE_KEY);
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<Profile>;
    return {
      nickname: p.nickname ?? "",
      interests: Array.isArray(p.interests) ? p.interests : [],
      gender: (p.gender as Gender) ?? "unspecified",
      country: p.country ?? "",
    };
  } catch {
    return null;
  }
}

export function saveProfile(p: Profile) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
}
