import { describe, expect, it } from "vitest";
import { contentRange, parseRange, unsatisfiableRange } from "@/lib/play/range-header";
import { detectDevice, externalPlayerUrl, orderApps, resumeQrUrl, stremioDeepLink } from "@/lib/play/external-player-links";
import { clientPlayability } from "@/lib/play/playability-client";
import { viewerIpForStreamMode } from "@/lib/play/viewer-ip-for-stream-mode";
import { watchHref } from "@/lib/play/watch-href";

/** Stream proxy Range parsing (RFC 9110) + hand-off deep links / device ordering + canPlayType refinement. */
describe("parseRange", () => {
  it("open, closed, suffix and clamped ranges", () => {
    expect(parseRange("bytes=0-499", 1000)).toEqual({ start: 0, end: 499 });
    expect(parseRange("bytes=500-", 1000)).toEqual({ start: 500, end: 999 });
    expect(parseRange("bytes=-200", 1000)).toEqual({ start: 800, end: 999 });
    expect(parseRange("bytes=900-5000", 1000)).toEqual({ start: 900, end: 999 });
    expect(contentRange({ start: 0, end: 499 }, 1000)).toBe("bytes 0-499/1000");
  });
  it("missing / malformed → null (200); out of bounds → unsatisfiable (416)", () => {
    expect(parseRange(null, 1000)).toBeNull();
    expect(parseRange("", 1000)).toBeNull();
    expect(parseRange("items=0-1", 1000)).toBeNull();
    expect(parseRange("bytes=-", 1000)).toBeNull();
    expect(parseRange("bytes=1000-", 1000)).toBe("unsatisfiable");
    expect(parseRange("bytes=600-500", 1000)).toBe("unsatisfiable");
    expect(parseRange("bytes=-0", 1000)).toBe("unsatisfiable");
    expect(parseRange("bytes=0-", 0)).toBe("unsatisfiable");
    expect(unsatisfiableRange(1000)).toBe("bytes */1000");
  });
});

describe("hand-off links", () => {
  const cdn = "https://cdn.example/f.mp4?token=x&a=1";
  it("device detection + sheet order (device app first, else mockup order)", () => {
    expect(detectDevice("Mozilla/5.0 (Linux; Android 12; SHIELD Android TV)")).toBe("android");
    expect(detectDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe("ios");
    expect(detectDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)")).toBe("mac");
    expect(detectDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("windows");
    expect(orderApps("android")).toEqual(["stremio", "infuse", "vlc"]);
    expect(orderApps("ios")).toEqual(["infuse", "stremio", "vlc"]);
    expect(orderApps("windows")).toEqual(["stremio", "infuse", "vlc"]);
  });
  it("deep links per target / device", () => {
    expect(externalPlayerUrl("infuse", cdn, "ios", null)).toBe(`infuse://x-callback-url/play?url=${encodeURIComponent(cdn)}`);
    expect(externalPlayerUrl("vlc", cdn, "ios", null)).toBe(`vlc-x-callback://x-callback-url/stream?url=${encodeURIComponent(cdn)}`);
    expect(externalPlayerUrl("vlc", cdn, "windows", null)).toBe(`vlc://${cdn}`);
    expect(externalPlayerUrl("iina", cdn, "mac", null)).toBe(`iina://weblink?url=${encodeURIComponent(cdn)}`);
    expect(externalPlayerUrl("copy", cdn, "mac", null)).toBe(cdn);
    expect(externalPlayerUrl("stremio", cdn, "android", null)).toBeNull();
    expect(stremioDeepLink({ imdbId: "tt10872600" })).toBe("stremio:///detail/movie/tt10872600");
    expect(stremioDeepLink({ imdbId: "tt4574334", season: 4, episode: 1 })).toBe("stremio:///detail/series/tt4574334/tt4574334:4:1");
  });
  it("QR resume URL", () => {
    expect(resumeQrUrl("https://lumen.example", { type: "movie", tmdbId: 634649 }, 5228.7)).toBe("https://lumen.example/movie/634649?play=1&t=5228");
    expect(resumeQrUrl("https://lumen.example", { type: "tv", tmdbId: 66732, season: 4, episode: 1 }, 10)).toBe("https://lumen.example/series/66732?s=4&e=1&play=1&t=10");
  });
  it("watchHref: QR `t` wins over resume, restart = t=0, continue card = resume=1", () => {
    const id = "a".repeat(32);
    expect(watchHref(id)).toBe(`/watch/${id}`);
    expect(watchHref(id, { resume: true })).toBe(`/watch/${id}?resume=1`);
    expect(watchHref(id, { restart: true })).toBe(`/watch/${id}?t=0`);
    expect(watchHref(id, { t: 5228.9, resume: true })).toBe(`/watch/${id}?t=5228`);
    expect(watchHref(id, { t: Number.NaN, resume: true })).toBe(`/watch/${id}?resume=1`);
  });
});

describe("viewerIpForStreamMode", () => {
  it("direct keeps the viewer IP (TRUST_PROXY), proxy never pins the link to the viewer", () => {
    expect(viewerIpForStreamMode("direct", "203.0.113.9")).toBe("203.0.113.9");
    expect(viewerIpForStreamMode("direct", undefined)).toBeUndefined();
    expect(viewerIpForStreamMode("proxy", "203.0.113.9")).toBeUndefined();
  });
});

describe("clientPlayability", () => {
  const chrome = (mime: string) => (mime.includes("x-matroska") ? "maybe" : mime.includes("avc1") ? "probably" : mime.includes("hvc1") ? "" : "maybe");
  const safari = (mime: string) => (mime.includes("x-matroska") ? "" : "probably");
  it("MP4 H.264 everywhere, MKV maybe on Chromium / no on Safari, HEVC depends on the decoder", () => {
    expect(clientPlayability("MP4", "H.264", chrome)).toBe("yes");
    expect(clientPlayability("MKV", "x265", chrome)).toBe("maybe");
    expect(clientPlayability("MKV", "H.264", safari)).toBe("no");
    expect(clientPlayability("MP4", "x265", chrome)).toBe("no");
    expect(clientPlayability("MP4", "x265", safari)).toBe("yes");
    expect(clientPlayability("MP4", "", () => "")).toBe("maybe");
  });
});
