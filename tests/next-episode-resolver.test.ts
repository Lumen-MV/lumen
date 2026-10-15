import { describe, expect, it } from "vitest";
import { pickerHref, resolveNextEpisode, type PostJson } from "@/lib/play/next-episode";

/** Next-episode resolution order: same pack (same hash) → best cached (auto) → picker; outages bubble up as errors. */
const HASH = "a".repeat(40);
const calls: Array<{ path: string; body: unknown }> = [];
const fake =
  (answers: Array<{ status: number; json: Record<string, unknown> | null }>): PostJson =>
  async (path, body) => {
    calls.push({ path, body });
    return answers.shift() ?? { status: 500, json: null };
  };

describe("resolveNextEpisode", () => {
  it("same pack → resolve with the current hash", async () => {
    calls.length = 0;
    const out = await resolveNextEpisode({ mediaKey: "tv:66732:4:2", samePack: true, currentHash: HASH }, fake([{ status: 200, json: { streamId: "1".repeat(32) } }]));
    expect(out).toEqual({ kind: "stream", streamId: "1".repeat(32) });
    expect(calls).toEqual([{ path: "/api/play/resolve", body: { mediaKey: "tv:66732:4:2", hash: HASH } }]);
  });
  it("pack file missing (404) → falls back to auto; auto 409 → picker", async () => {
    calls.length = 0;
    const out = await resolveNextEpisode({ mediaKey: "tv:66732:4:2", samePack: true, currentHash: HASH }, fake([{ status: 404, json: { code: "NO_VIDEO_FILE" } }, { status: 409, json: { code: "NOT_CACHED" } }]));
    expect(out).toEqual({ kind: "picker" });
    expect(calls.map((c) => c.body)).toEqual([{ mediaKey: "tv:66732:4:2", hash: HASH }, { mediaKey: "tv:66732:4:2", auto: true }]);
  });
  it("not a pack → auto directly; TorBox outage → error with the status", async () => {
    calls.length = 0;
    expect(await resolveNextEpisode({ mediaKey: "tv:1:1:2", samePack: false, currentHash: HASH }, fake([{ status: 200, json: { streamId: "2".repeat(32) } }]))).toEqual({ kind: "stream", streamId: "2".repeat(32) });
    expect(calls).toHaveLength(1);
    expect(await resolveNextEpisode({ mediaKey: "tv:1:1:2", samePack: false, currentHash: HASH }, fake([{ status: 503, json: { code: "TORBOX_UNREACHABLE" } }]))).toEqual({ kind: "error", status: 503 });
    expect(await resolveNextEpisode({ mediaKey: "tv:1:1:2", samePack: true, currentHash: HASH }, fake([{ status: 503, json: null }]))).toEqual({ kind: "error", status: 503 });
  });
  it("picker href carries season + episode + pick=1", () => {
    expect(pickerHref(66732, 4, 2)).toBe("/series/66732?s=4&e=2&pick=1");
  });
});
