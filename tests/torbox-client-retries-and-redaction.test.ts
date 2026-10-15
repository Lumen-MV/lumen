import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

/** torbox-client: 429 honours Retry-After once, 5xx retries twice with jitter, timeouts → status 0, success:false with 200, token redaction. */
process.env.SESSION_SECRET = "test-secret-test-secret-test-secret-1234";
process.env.ADMIN_USERNAME = "owner";
process.env.ADMIN_PASSWORD = "admin-pass-123";
process.env.TORBOX_API_KEY = "tb-SECRET-KEY-1234567890";

vi.mock("@/lib/dev/scenario-flags-server", () => ({ currentScenario: async () => new Set() }));

type Client = typeof import("@/lib/torbox/torbox-client");
let c: Client;
const fetchMock = vi.fn<typeof fetch>();

const json = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

beforeAll(async () => {
  vi.stubGlobal("fetch", fetchMock);
  c = await import("@/lib/torbox/torbox-client");
});
afterEach(() => fetchMock.mockReset());

describe("TorboxError hygiene", () => {
  it("message, detail and path never carry the token; JSON / String / stack are token-free", () => {
    const err = new c.TorboxError("TorBox 500 /torrents/requestdl?token=tb-SECRET-KEY-1234567890&file_id=1: boom token=tb-SECRET-KEY-1234567890", 500, "see https://x/?token=tb-SECRET-KEY-1234567890", "/torrents/requestdl?token=tb-SECRET-KEY-1234567890&torrent_id=1");
    const dump = JSON.stringify({ ...err, message: err.message, stack: err.stack }) + String(err) + err.path + err.detail;
    expect(dump).not.toContain("tb-SECRET-KEY");
    expect(dump).not.toMatch(/token=(?!\*\*\*)/);
    expect(err.path).toBe("/torrents/requestdl");
    expect(c.redactToken("a?token=abc&b=1 token=xyz")).toBe("a?token=***&b=1 token=***");
  });
  it("isTorrentGone: 404 or a 4xx 'not found' detail; isTorboxUnreachable: 0 / 429 / 5xx", () => {
    expect(c.isTorrentGone(new c.TorboxError("x", 404, "Not Found", "/p"))).toBe(true);
    expect(c.isTorrentGone(new c.TorboxError("x", 400, "torrent not found", "/p"))).toBe(true);
    expect(c.isTorrentGone(new c.TorboxError("x", 500, "not found", "/p"))).toBe(false);
    expect(c.isTorboxUnreachable(new c.TorboxError("x", 0, "network", "/p"))).toBe(true);
    expect(c.isTorboxUnreachable(new c.TorboxError("x", 429, "slow", "/p"))).toBe(true);
    expect(c.isTorboxUnreachable(new c.TorboxError("x", 400, "bad", "/p"))).toBe(false);
  });
});

describe("call retries", () => {
  it("429 → one retry after Retry-After (capped), then the answer", async () => {
    fetchMock.mockResolvedValueOnce(json(429, { success: false, detail: "slow down" }, { "retry-after": "0" })).mockResolvedValueOnce(json(200, { success: true, data: { id: 5, download_state: "cached", progress: 1 } }));
    const t = await c.getTorrent(5);
    expect(t?.id).toBe(5);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("5xx → up to two retries, then TorboxError(status) with errors counted", async () => {
    const before = c.torboxStats.errors;
    fetchMock.mockResolvedValue(json(502, { success: false, detail: "bad gateway" }));
    await expect(c.getTorrent(1)).rejects.toMatchObject({ name: "TorboxError", status: 502 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(c.torboxStats.errors).toBe(before + 1);
    expect(c.torboxStats.retries).toBeGreaterThanOrEqual(2);
  }, 10_000);
  it("5xx then 200 → recovers on the retry", async () => {
    fetchMock.mockResolvedValueOnce(json(503, { success: false })).mockResolvedValueOnce(json(200, { success: true, data: [] }));
    expect(await c.listTorrents()).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("network failure / timeout → status 0 'unreachable', endpoint only in the message", async () => {
    fetchMock.mockRejectedValueOnce(Object.assign(new Error("aborted"), { name: "TimeoutError" }));
    await expect(c.requestDownloadLink(1, 2)).rejects.toMatchObject({ status: 0, path: "/torrents/requestdl", message: "TorBox unreachable /torrents/requestdl: TimeoutError" });
  });
  it("HTTP 200 with success:false is an error carrying the upstream detail (4xx-like, no retry)", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { success: false, detail: "Found no cached torrent" }));
    await expect(c.createTorrent("magnet:?xt=urn:btih:" + "a".repeat(40), { addOnlyIfCached: true })).rejects.toMatchObject({ status: 200, detail: "Found no cached torrent" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("checkCached batches ≤ 100 hashes per request and lower-cases keys", async () => {
    const hashes = Array.from({ length: 150 }, (_, i) => i.toString(16).padStart(40, "0"));
    fetchMock.mockImplementation(async (_url, init) => {
      const batch = JSON.parse(String(init?.body)).hashes as string[];
      expect(batch.length).toBeLessThanOrEqual(100);
      return json(200, { success: true, data: [{ hash: batch[0].toUpperCase(), files: [] }] });
    });
    const out = await c.checkCached(hashes);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(out.has(hashes[0]) && out.has(hashes[100])).toBe(true);
  });
  it("the Authorization header carries the key; it never appears in the URL of non-requestdl calls", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { success: true, data: null }));
    await c.controlTorrent(9, "delete");
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).not.toContain("SECRET");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer tb-SECRET-KEY-1234567890");
  });
});
