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

export type Profile = { nickname: string; interests: string[] };

export function loadProfile(): Profile | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(PROFILE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Profile;
  } catch {
    return null;
  }
}

export function saveProfile(p: Profile) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
}
