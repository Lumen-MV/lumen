import { playerManifestResponse } from "@/lib/http/player-manifest-handler";

export const dynamic = "force-dynamic";

/** GET /api/play/manifest?streamId= → PlayerManifest (410 STREAM_EXPIRED · 429 LIMIT_5). */
export const GET = (req: Request) => playerManifestResponse(req, new URL(req.url).searchParams.get("streamId") ?? "");
