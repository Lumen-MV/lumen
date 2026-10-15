/** "Yêu cầu thêm phim này" throttle: one request per minute per (user, title), process memory (pure, unit-tested). */
export const REQUEST_WINDOW_MS = 60_000;
const g = globalThis as unknown as { __hcRequestLog?: Map<string, number> };
const recent = (): Map<string, number> => (g.__hcRequestLog ??= new Map());

/** True when this (user, title) already requested inside the window; records the request otherwise. */
export function throttleRequest(userId: number, mediaKey: string, now = Date.now()): boolean {
  const m = recent();
  for (const [k, at] of m) if (now - at >= REQUEST_WINDOW_MS) m.delete(k);
  const key = `${userId}:${mediaKey}`;
  if (m.has(key)) return true;
  m.set(key, now);
  return false;
}
