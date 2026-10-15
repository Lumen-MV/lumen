import { describe, expect, it } from "vitest";
import { getStream, registerStream, STREAM_TTL_MS } from "@/lib/play/stream-registry";
import { REQUEST_WINDOW_MS, throttleRequest } from "@/lib/sources/request-throttle";

/** Stream handles: opaque ids, 50-min TTL, bound to the resolving user, sweep + cap. Request throttle: 1/min/user/title. */
const NOW = 1_800_000_000_000;
const entry = (userId: number) => ({ cdnUrl: "https://cdn.example/f?token=SECRET", torrentId: 1, fileId: 0, fileName: "a.mp4", userId, mediaKey: "movie:1", release: { hash: "a".repeat(40), title: "t", qualityLabel: "1080p" }, playClass: "direct" as const });

describe("stream registry", () => {
  it("32-hex opaque id, TTL 50 min, only the owner can read it, expiry at exactly 50 min", () => {
    const e = registerStream(entry(1), NOW);
    expect(e.streamId).toMatch(/^[0-9a-f]{32}$/);
    expect(STREAM_TTL_MS).toBe(50 * 60_000);
    expect(e.expiresAt).toBe(NOW + STREAM_TTL_MS);
    expect(getStream(e.streamId, 1, NOW + 1000)?.cdnUrl).toContain("SECRET");
    expect(getStream(e.streamId, 2, NOW + 1000)).toBeNull();
    expect(getStream(e.streamId, 1, NOW + STREAM_TTL_MS)).toBeNull();
    expect(getStream("0".repeat(32), 1, NOW)).toBeNull();
  });
  it("sweep drops expired handles on the next register; the map is capped at 500", () => {
    const old = registerStream(entry(1), NOW);
    registerStream(entry(1), NOW + STREAM_TTL_MS + 1);
    expect(getStream(old.streamId, 1, NOW + STREAM_TTL_MS + 2)).toBeNull();
    const ids: string[] = [];
    for (let i = 0; i < 520; i++) ids.push(registerStream(entry(1), NOW + STREAM_TTL_MS + 10 + i).streamId);
    const alive = ids.filter((id) => getStream(id, 1, NOW + STREAM_TTL_MS + 600) !== null).length;
    expect(alive).toBeLessThanOrEqual(500);
    expect(getStream(ids[519], 1, NOW + STREAM_TTL_MS + 600)).not.toBeNull(); // newest survives
  });
});

describe("request throttle", () => {
  it("one request per minute per (user, title); other users / titles are independent", () => {
    expect(throttleRequest(1, "movie:1", NOW)).toBe(false);
    expect(throttleRequest(1, "movie:1", NOW + 10_000)).toBe(true);
    expect(throttleRequest(2, "movie:1", NOW + 10_000)).toBe(false);
    expect(throttleRequest(1, "movie:2", NOW + 10_000)).toBe(false);
    expect(throttleRequest(1, "movie:1", NOW + REQUEST_WINDOW_MS)).toBe(false);
  });
});
