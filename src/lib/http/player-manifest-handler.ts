import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/require-admin";
import { readScenario, readScenarioParams } from "@/lib/dev/scenario-flags";
import { buildPlayerManifest, streamMode } from "@/lib/play/build-player-manifest";
import { getStream } from "@/lib/play/stream-registry";
import { checkViewerLimit } from "@/lib/play/viewer-limit";

/**
 * GET /api/play/manifest?streamId=: session → registry ownership
 * (410 STREAM_EXPIRED) → viewer limit (429 LIMIT_5, hand-off is not counted) → manifest JSON. The only client-visible
 * place the stream `src` ever appears, and only for the user who resolved it.
 */
export async function playerManifestResponse(req: Request, streamId: string): Promise<NextResponse> {
  const me = await requireUserApi();
  if (me instanceof NextResponse) return me;
  if (!/^[0-9a-f]{32}$/.test(streamId)) return NextResponse.json({ code: "BAD_REQUEST", issues: ["streamId"] }, { status: 400 });
  const entry = getStream(streamId, me.user.id);
  if (!entry) return NextResponse.json({ code: "STREAM_EXPIRED" }, { status: 410 });
  const limit = checkViewerLimit(me.user.id);
  if (!limit.ok) return NextResponse.json({ code: "LIMIT_5", active: limit.active, limit: limit.limit }, { status: 429 });
  try {
    const manifest = await buildPlayerManifest(entry, me.user.id, streamMode(readScenarioParams(req)), readScenario(req));
    return NextResponse.json(manifest, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("[play/manifest]", err instanceof Error ? err.message : err);
    return NextResponse.json({ code: "SERVER_ERROR" }, { status: 500 });
  }
}
