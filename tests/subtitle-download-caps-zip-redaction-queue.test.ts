import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { redactStderr } from "@/lib/subtitles/embedded-subtitle-extractor";
import { BodyTooLargeError, readBodyCapped } from "@/lib/subtitles/fetch-body-capped";
import { enqueueFfmpeg, ffmpegQueueLength } from "@/lib/subtitles/ffmpeg-queue";
import { isSubFile } from "@/lib/subtitles/subdl-client";
import { SEARCH_RETRY_TTL_MS, SEARCH_TTL_MS, searchTtlMs } from "@/lib/subtitles/subtitle-search-cache-policy";
import { unzip } from "@/lib/subtitles/zip-extract";
import { publicErrorMessage } from "@/lib/translate/subtitle-translate-job";
import { TranslatorUnavailableError } from "@/lib/translate/translator-interface";

/** Phase 5 fix round 1: CDN URL redaction, download / inflate caps, ffmpeg serialisation, negative-cache TTL, public error text. */
process.env.SESSION_SECRET = "test-secret-test-secret-test-secret-1234";
process.env.ADMIN_USERNAME = "owner";
process.env.ADMIN_PASSWORD = "admin-pass-123";

const CDN = "https://abc123.tb-cdn.pw/dl/movie.mkv?token=SECRET-TOKEN-xyz&x=1";

describe("redactStderr", () => {
  it("an ffmpeg / ffprobe failure message never contains the CDN host, the token or any URL", () => {
    const stderr = `[https @ 0x1] HTTP error 403 Forbidden\n${CDN}: Server returned 403 Forbidden\nError opening input file ${CDN}.`;
    const out = redactStderr(stderr, [CDN]);
    expect(out).not.toContain("token=SECRET");
    expect(out).not.toContain("tb-cdn.pw");
    expect(out).not.toMatch(/https?:\/\//);
    expect(out).toContain("<cdn>: Server returned 403 Forbidden");
    // a URL ffmpeg reformatted (not byte-identical to the secret) is still caught by the generic pass
    const other = redactStderr("Error opening input https://other.tb-cdn.pw/x?token=abc: 404", []);
    expect(other).toBe("Error opening input <url> 404");
    expect(redactStderr("token=abc&x", [])).toBe("token=<redacted>&x");
  });
});

describe("readBodyCapped", () => {
  it("rejects a declared content-length over the cap, a streamed body over the cap, accepts a small body", async () => {
    await expect(readBodyCapped(new Response("x", { headers: { "content-length": "9999999" } }), 1000)).rejects.toThrow(BodyTooLargeError);
    const big = new ReadableStream<Uint8Array>({ start(c) { for (let i = 0; i < 5; i++) c.enqueue(new Uint8Array(300)); c.close(); } });
    await expect(readBodyCapped(new Response(big), 1000)).rejects.toThrow(/exceeds 1000 bytes/);
    const ok = await readBodyCapped(new Response(new Uint8Array([1, 2, 3])), 1000);
    expect([...ok]).toEqual([1, 2, 3]);
  });
});

function zip(entries: Array<[string, Buffer, boolean]>): Uint8Array {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let off = 0;
  for (const [name, raw, deflate] of entries) {
    const data = deflate ? deflateRawSync(raw) : raw;
    const n = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(deflate ? 8 : 0, 8); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(deflate ? 8 : 0, 10); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(off, 42);
    parts.push(local, n, data);
    central.push(c, n);
    off += local.length + n.length + data.length;
  }
  const cd = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10); eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(off, 16);
  return new Uint8Array(Buffer.concat([...parts, cd, eocd]));
}

describe("unzip caps + name filter", () => {
  const bomb = Buffer.alloc(2 * 1024 * 1024, 0); // 2 MiB of zeros deflates to ~2 KB
  it("a deflate bomb beyond maxOutputLength throws before anything is inflated past the cap", () => {
    expect(() => unzip(zip([["bomb.srt", bomb, true]]), { maxOutputLength: 1024 * 1024 })).toThrow(/exceeds the inflate cap/);
    expect(unzip(zip([["bomb.srt", bomb, true]]), { maxOutputLength: 4 * 1024 * 1024 })[0].bytes.byteLength).toBe(bomb.length);
    // declared size lies (small) → zlib's own maxOutputLength catches it
    const lying = zip([["bomb.srt", bomb, true]]);
    const view = Buffer.from(lying.buffer, lying.byteOffset, lying.byteLength);
    const cdOff = view.readUInt32LE(view.length - 22 + 16);
    view.writeUInt32LE(10, cdOff + 24);
    expect(() => unzip(lying, { maxOutputLength: 1024 * 1024 })).toThrow();
  });
  it("entries filtered by name are never inflated (corrupt deflate data in readme.txt is harmless)", () => {
    const data = zip([["readme.txt", Buffer.from("junk"), false], ["Movie.srt", Buffer.from("1\n00:00:01,000 --> 00:00:02,000\nhi"), true]]);
    const view = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    const cdOff = view.readUInt32LE(view.length - 22 + 16);
    view.writeUInt16LE(8, cdOff + 10); // central directory now claims readme.txt is deflated although it is stored garbage
    expect(() => unzip(data)).toThrow();
    expect(unzip(data, { filter: isSubFile }).map((e) => e.name)).toEqual(["Movie.srt"]);
    expect(isSubFile("__MACOSX/._x.srt")).toBe(false);
  });
  it("the total inflated size is capped across entries", () => {
    const half = Buffer.alloc(700 * 1024, 1);
    expect(() => unzip(zip([["a.srt", half, true], ["b.srt", half, true]]), { maxOutputLength: 1024 * 1024 })).toThrow(/cap/);
  });
});

describe("ffmpeg queue", () => {
  it("runs one task at a time in FIFO order; a failure does not block the next", async () => {
    const order: string[] = [];
    let running = 0;
    let peak = 0;
    const task = (name: string, ms: number, fail = false) => enqueueFfmpeg(async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, ms));
      running--;
      order.push(name);
      if (fail) throw new Error(`${name} failed`);
      return name;
    });
    const a = task("a", 30);
    const b = task("b", 5, true);
    const c = task("c", 5);
    expect(ffmpegQueueLength()).toBe(3);
    await expect(b).rejects.toThrow(/b failed/);
    expect(await a).toBe("a");
    expect(await c).toBe("c");
    expect(order).toEqual(["a", "b", "c"]);
    expect(peak).toBe(1);
    expect(ffmpegQueueLength()).toBe(0);
  });
});

describe("search cache policy + public error text", () => {
  it("24 h only for a clean full result; 10 min after a provider failure or without an IMDb id", () => {
    expect(searchTtlMs({ failed: false, imdbId: "tt1" })).toBe(SEARCH_TTL_MS);
    expect(searchTtlMs({ failed: true, imdbId: "tt1" })).toBe(SEARCH_RETRY_TTL_MS);
    expect(searchTtlMs({ failed: false, imdbId: null })).toBe(SEARCH_RETRY_TTL_MS);
    expect(SEARCH_RETRY_TTL_MS).toBe(10 * 60_000);
  });
  it("provider messages pass (kie-down stays recognisable), paths and unknown errors never reach the client", () => {
    expect(publicErrorMessage(new TranslatorUnavailableError("Kie unreachable: simulated outage (kie-down)", 503))).toMatch(/kie-down/);
    expect(publicErrorMessage(new Error("ENOENT: no such file or directory, open 'C:\\apps\\lumen\\data\\subs\\12.vtt'"))).toBe("internal error");
    expect(publicErrorMessage(new TranslatorUnavailableError("read C:\\apps\\x\\y.json and /var/data/z failed", 500))).toBe("read <path> and <path> failed");
    expect(publicErrorMessage("boom")).toBe("internal error");
  });
});
