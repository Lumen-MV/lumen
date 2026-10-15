import { NextResponse } from "next/server";
import { z } from "zod";
import { parseMediaKey, type MediaKey } from "@/lib/catalog/media-key";
import { parseJsonBody } from "./parse-json-body";

// `tv:1` is the shortest valid key (4 chars); parseMediaKey is the real validator, the bounds only stop junk early
const bodySchema = z.object({ mediaKey: z.string().min(4).max(40) });

/** `{mediaKey}` body → parsed MediaKey, or a ready 400 response (shared by /api/my-list and /api/likes). */
export async function parseMediaKeyBody(req: Request): Promise<MediaKey | NextResponse> {
  const body = await parseJsonBody(req, bodySchema);
  if (body instanceof NextResponse) return body;
  const key = parseMediaKey(body.mediaKey);
  return key ?? NextResponse.json({ code: "BAD_REQUEST", issues: ["mediaKey"] }, { status: 400 });
}
