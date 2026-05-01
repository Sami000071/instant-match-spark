// Local cache of blocked client ids (mirrors server `blocks` table for this device).
const KEY = "blink_chat_blocks";

export function loadBlocked(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]") as string[];
  } catch {
    return [];
  }
}

export function addBlocked(id: string) {
  if (typeof window === "undefined") return;
  const cur = new Set(loadBlocked());
  cur.add(id);
  localStorage.setItem(KEY, JSON.stringify([...cur]));
}
