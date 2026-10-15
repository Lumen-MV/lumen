/** Pure username rules shared by server validation and the client-side invite form (no DB imports here). */
export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

/** "Bảo" → "bao": strip diacritics, đ→d, keep [a-z0-9_]. */
export function slugifyUsername(displayName: string): string {
  return displayName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 20);
}
