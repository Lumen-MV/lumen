import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody } from "@/lib/http/parse-json-body";
import { subsContext, subsErrorResponse, validMediaKey } from "@/lib/http/subs-route-helpers";
import { startTranslateJob } from "@/lib/translate/subtitle-translate-job";

export const dynamic = "force-dynamic";
const bodySchema = z.object({ sourceSubId: z.number().int().positive(), mediaKey: z.string().min(4).max(40) });

/**
 * POST /api/subs/translate {sourceSubId, mediaKey} → 202 {jobId} · 200 {subId} when already translated ·
 * 409 JOB_RUNNING {jobId} · 429 DAILY_LIMIT · 404 / 422 / 503 for a bad source or no configured translator.
 */
export async function POST(req: Request) {
  const ctx = await subsContext(req);
  if (ctx instanceof NextResponse) return ctx;
  const body = await parseJsonBody(req, bodySchema);
  if (body instanceof NextResponse) return body;
  const mediaKey = validMediaKey(body.mediaKey);
  if (mediaKey instanceof NextResponse) return mediaKey;
  try {
    const out = await startTranslateJob({ userId: ctx.me.user.id, mediaKey, sourceSubId: body.sourceSubId, scenario: ctx.scenario, params: ctx.params });
    switch (out.kind) {
      case "exists":
        return NextResponse.json({ subId: out.subId });
      case "started":
        return NextResponse.json({ jobId: out.jobId }, { status: 202 });
      case "running":
        return NextResponse.json({ code: "JOB_RUNNING", jobId: out.jobId }, { status: 409 });
      case "limit":
        return NextResponse.json({ code: "DAILY_LIMIT" }, { status: 429 });
      default:
        return NextResponse.json({ code: out.reason }, { status: out.reason === "NOT_FOUND" ? 404 : out.reason === "NO_TRANSLATOR" ? 503 : 422 });
    }
  } catch (err) {
    return subsErrorResponse("subs/translate", err);
  }
}
