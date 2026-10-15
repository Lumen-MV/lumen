import { NextResponse } from "next/server";
import { proxyStreamEntry } from "@/lib/http/stream-proxy-handler";
import { getStream } from "@/lib/play/stream-registry";
import { CORS, stremioDevice, stremioJson } from "@/lib/stremio/stremio-route-helpers";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ token: string; streamId: string }> };

/**
 * GET/HEAD /stremio/[token]/file/[streamId] — STREAM_MODE=proxy target of the play 302: the registry entry must belong to
 * the token's user (a handle minted for another member or an expired one answers 410), then the shared Range pipe.
 */
async function handle(req: Request, token: string, streamId: string, head: boolean): Promise<Response> {
  const device = stremioDevice(token, null); // Range-heavy pipe: the handle itself is the (play-limited) capability
  if (device instanceof NextResponse) return device;
  if (!/^[0-9a-f]{32}$/.test(streamId)) return stremioJson({ error: "bad request" }, 400);
  const entry = getStream(streamId, device.user.id);
  if (!entry) return stremioJson({ error: "STREAM_EXPIRED" }, 410);
  return proxyStreamEntry(req, entry, head);
}

export const GET = async (req: Request, ctx: Ctx) => { const p = await ctx.params; return handle(req, p.token, p.streamId, false); };
export const HEAD = async (req: Request, ctx: Ctx) => { const p = await ctx.params; return handle(req, p.token, p.streamId, true); };
export const OPTIONS = () => new NextResponse(null, { status: 204, headers: CORS });
