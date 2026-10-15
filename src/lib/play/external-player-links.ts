/**
 * Deep links for the hand-off sheet (phase-04 Key Insights) + device ordering. Pure: no window access, the caller
 * passes the user agent. `copy` and `qr` are not apps: `copy` = the raw stream URL, `qr` = our own resume URL.
 */
export type HandoffTarget = "stremio" | "infuse" | "vlc" | "iina" | "copy" | "qr";
export type HandoffApp = "stremio" | "infuse" | "vlc";
export type DeviceKind = "android" | "ios" | "mac" | "windows" | "other";

export function detectDevice(ua: string): DeviceKind {
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && /mobile/i.test(ua))) return "ios";
  if (/macintosh|mac os x/i.test(ua)) return "mac";
  if (/windows/i.test(ua)) return "windows";
  return "other";
}

/** Sheet order: the device's natural app first (Android → Stremio, Apple → Infuse); everything else keeps the mockup order. */
export function orderApps(device: DeviceKind): HandoffApp[] {
  const base: HandoffApp[] = ["stremio", "infuse", "vlc"];
  const first: HandoffApp | null = device === "android" ? "stremio" : device === "ios" || device === "mac" ? "infuse" : null;
  return first ? [first, ...base.filter((a) => a !== first)] : base;
}

export type StremioRef = { imdbId: string; season?: number; episode?: number };

/** `stremio:///detail/{movie|series}/{imdb}[/{imdb}:{s}:{e}]` — the addon (Phase 6) lists the title first. */
export function stremioDeepLink(ref: StremioRef): string {
  const series = ref.season !== undefined && ref.episode !== undefined;
  return series ? `stremio:///detail/series/${ref.imdbId}/${ref.imdbId}:${ref.season}:${ref.episode}` : `stremio:///detail/movie/${ref.imdbId}`;
}

/**
 * Target → URL the browser should open (apps) or copy (`copy`). Device decides the VLC scheme (iOS x-callback vs desktop
 * `vlc://`). `subUrl` (signed, session-less `.srt`, path-style) rides along as `&sub=` where the scheme documents it:
 * Infuse (support.firecore.com API article: play `url`, `sub`, `position`, `filename` — "all querystring values should
 * be url-safe or encoded", example sidecars are `.srt`) and VLC iOS x-callback (`sub` added in vlc-ios MR 7; the
 * handler percent-decodes a value whose first 14 chars contain `%3A%2F%2F`, i.e. a fully encoded URL). Both values are
 * `encodeURIComponent`-encoded in full, so `new URL(link).searchParams` recovers them verbatim (unit-tested).
 * Desktop `vlc://` and IINA have no subtitle parameter.
 */
export function externalPlayerUrl(target: Exclude<HandoffTarget, "qr">, streamUrl: string, device: DeviceKind, stremio: StremioRef | null, subUrl: string | null = null): string | null {
  const enc = encodeURIComponent(streamUrl);
  const sub = subUrl ? `&sub=${encodeURIComponent(subUrl)}` : "";
  switch (target) {
    case "infuse":
      return `infuse://x-callback-url/play?url=${enc}${sub}`;
    case "vlc":
      return device === "ios" ? `vlc-x-callback://x-callback-url/stream?url=${enc}${sub}` : `vlc://${streamUrl}`;
    case "iina":
      return `iina://weblink?url=${enc}`;
    case "stremio":
      return stremio ? stremioDeepLink(stremio) : null;
    case "copy":
      return streamUrl;
  }
}

/** `${origin}/movie/{id}?play=1&t={pos}` or `/series/{id}?s=&e=&play=1&t=` — what the TV scans. */
export function resumeQrUrl(origin: string, key: { type: "movie" | "tv"; tmdbId: number; season?: number; episode?: number }, positionS: number): string {
  const t = Math.max(0, Math.floor(positionS));
  if (key.type === "movie") return `${origin}/movie/${key.tmdbId}?play=1&t=${t}`;
  const se = key.season !== undefined && key.episode !== undefined ? `s=${key.season}&e=${key.episode}&` : "";
  return `${origin}/series/${key.tmdbId}?${se}play=1&t=${t}`;
}
