import { NextResponse } from "next/server";
import { isSampleEntry } from "@/lib/play/sample-stream";
import type { StreamEntry } from "@/lib/play/stream-registry";

/**
 * STREAM_MODE=proxy pipe shared by /api/play/stream/[streamId] (session) and /stremio/[token]/file/[streamId] (device
 * token): forwards the viewer's `Range` to the TorBox CDN and passes 200 / 206 / 416 + Content-Range / Accept-Ranges /
 * Content-Length / Content-Type straight through (no buffering: the upstream body stream is the response body). The CDN
 * URL (API key inside) stays on the server. Closing the player aborts the upstream fetch.
 */
const PASS_HEADERS = ["content-type", "content-length", "content-range", "accept-ranges", "last-modified", "etag"];

export async function proxyStreamEntry(req: Request, entry: StreamEntry, head: boolean): Promise<Response> {
  // never ask for a compressed body: undici would decompress it transparently and the forwarded Content-Length would lie
  const headers: Record<string, string> = { "accept-encoding": "identity" };
  const range = req.headers.get("range");
  if (range) headers.range = range;
  const ifRange = req.headers.get("if-range");
  if (ifRange) headers["if-range"] = ifRange;
  // dev sample lives on this very server: its scenario cookie (link-expired) must travel with the upstream request
  if (isSampleEntry(entry) && req.headers.get("cookie")) headers.cookie = req.headers.get("cookie")!;
  const ctrl = new AbortController();
  req.signal.addEventListener("abort", () => ctrl.abort(), { once: true });
  let upstream: Response;
  try {
    upstream = await fetch(entry.cdnUrl, { method: head ? "HEAD" : "GET", headers, signal: ctrl.signal, redirect: "follow" });
    if (head && (upstream.status === 405 || upstream.status === 501)) upstream = await fetch(entry.cdnUrl, { method: "GET", headers, signal: ctrl.signal, redirect: "follow" });
  } catch (err) {
    if (ctrl.signal.aborted) return new NextResponse(null, { status: 499 });
    console.warn("[play/stream] upstream failed", err instanceof Error ? err.name : err);
    return NextResponse.json({ code: "UPSTREAM_FAILED" }, { status: 502 });
  }
  const out = new Headers({ "cache-control": "no-store", "access-control-allow-origin": "*" });
  // an encoded upstream (should not happen with identity, but a CDN may ignore it) is decoded by undici → its length is wrong
  const encoded = Boolean(upstream.headers.get("content-encoding")) && upstream.headers.get("content-encoding") !== "identity";
  for (const h of PASS_HEADERS) {
    const v = upstream.headers.get(h);
    if (v && !(encoded && h === "content-length")) out.set(h, v);
  }
  if (!out.has("accept-ranges")) out.set("accept-ranges", "bytes");
  if (head || upstream.status === 416 || !upstream.body) {
    if (head && upstream.body) await upstream.body.cancel().catch(() => {});
    return new NextResponse(null, { status: upstream.status, headers: out });
  }
  return new NextResponse(upstream.body, { status: upstream.status, headers: out });
}
