/** `/watch/[streamId]` query: `?resume=1` (continue card / "▶ Tiếp tục" — silent resume), `?t=N` (QR deep link / "Xem từ đầu" = 0 — silent seek, no prompt). */
export type PlayOptions = { resume?: boolean; restart?: boolean; t?: number };

export function watchHref(streamId: string, opts: PlayOptions = {}): string {
  const t = opts.t !== undefined && Number.isFinite(opts.t) && opts.t >= 0 ? Math.floor(opts.t) : opts.restart ? 0 : null;
  const q = t !== null ? `?t=${t}` : opts.resume ? "?resume=1" : "";
  return `/watch/${streamId}${q}`;
}
