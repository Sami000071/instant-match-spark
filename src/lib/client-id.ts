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

const PROFILE_KEY = "blink_chat_profile_v2";

export type Profile = {
  nickname: string;
  age: number | null;
  country: string;
  gender: "male" | "female" | "nonbinary" | "unspecified";
  avatarUrl: string;
};

export const EMPTY_PROFILE: Profile = {
  nickname: "",
  age: null,
  country: "",
  gender: "unspecified",
  avatarUrl: "",
};

export function setClientId(id: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, id);
}

export function loadProfile(): Profile | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(PROFILE_KEY);
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<Profile>;
    return {
      nickname: p.nickname ?? "",
      age: typeof p.age === "number" ? p.age : null,
      country: p.country ?? "",
      gender: (p.gender as Profile["gender"]) ?? "unspecified",
      avatarUrl: p.avatarUrl ?? "",
    };
  } catch {
    return null;
  }
}

export function saveProfile(p: Profile) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
}
