import fs from "node:fs";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { devScenariosEnabled } from "@/lib/config/env";
import { readScenario, readScenarioParams } from "@/lib/dev/scenario-flags";
import { ensureSample, parseSampleVariant, sampleContentType } from "@/lib/dev/sample-media";
import { contentRange, parseRange, unsatisfiableRange } from "@/lib/play/range-header";

export const dynamic = "force-dynamic";

/**
 * GET/HEAD /api/dev/sample.mp4?v=plain|ac3|mkv&g=N → the local ffmpeg sample with full Range support (200 / 206 / 416),
 * the stand-in for the TorBox CDN in every player QA run. 404 unless LUMEN_SCENARIOS=1. Scenario `link-expired` makes the
 * route answer 403 like an expired CDN link until the player re-resolves (`g` ≥ 1 = refreshed link); `link-expired=fail`
 * stays 403 whatever `g` is (second refresh fails too → "link-expired-fail" dialog).
 */
async function handle(req: Request, head: boolean): Promise<Response> {
  if (!devScenariosEnabled()) return new NextResponse(null, { status: 404 });
  const url = new URL(req.url);
  if (readScenario(req).has("link-expired")) {
    const mode = readScenarioParams(req).get("link-expired");
    const gen = Number(url.searchParams.get("g") ?? "0");
    if (mode === "fail" || !(gen >= 1)) return new NextResponse(null, { status: 403 });
  }
  const variant = parseSampleVariant(url.searchParams.get("v"));
  let file: string;
  try {
    file = await ensureSample(variant);
  } catch (err) {
    console.error("[dev/sample]", err instanceof Error ? err.message : err);
    return NextResponse.json({ code: "SAMPLE_UNAVAILABLE" }, { status: 500 });
  }
  const size = fs.statSync(file).size;
  const headers = new Headers({ "accept-ranges": "bytes", "content-type": sampleContentType(variant), "cache-control": "no-store" });
  const range = parseRange(req.headers.get("range"), size);
  if (range === "unsatisfiable") {
    headers.set("content-range", unsatisfiableRange(size));
    return new NextResponse(null, { status: 416, headers });
  }
  const start = range?.start ?? 0;
  const end = range?.end ?? size - 1;
  headers.set("content-length", String(end - start + 1));
  if (range) headers.set("content-range", contentRange(range, size));
  const status = range ? 206 : 200;
  if (head) return new NextResponse(null, { status, headers });
  const stream = fs.createReadStream(file, { start, end });
  req.signal.addEventListener("abort", () => stream.destroy(), { once: true });
  return new NextResponse(Readable.toWeb(stream) as ReadableStream, { status, headers });
}

export const GET = (req: Request) => handle(req, false);
export const HEAD = (req: Request) => handle(req, true);
