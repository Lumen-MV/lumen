import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/require-admin";
import { proxyStreamEntry } from "@/lib/http/stream-proxy-handler";
import { getStream } from "@/lib/play/stream-registry";

export const dynamic = "force-dynamic";

/**
 * GET/HEAD /api/play/stream/[streamId] — STREAM_MODE=proxy: session + registry ownership required, then the shared
 * Range-preserving pipe (stream-proxy-handler.ts). The Stremio variant lives at /stremio/[token]/file/[streamId].
 */
async function handle(req: Request, streamId: string, head: boolean): Promise<Response> {
  const me = await requireUserApi();
  if (me instanceof NextResponse) return me;
  const entry = getStream(streamId, me.user.id);
  if (!entry) return NextResponse.json({ code: "STREAM_EXPIRED" }, { status: 410 });
  return proxyStreamEntry(req, entry, head);
}

type Ctx = { params: Promise<{ streamId: string }> };
export const GET = async (req: Request, ctx: Ctx) => handle(req, (await ctx.params).streamId, false);
export const HEAD = async (req: Request, ctx: Ctx) => handle(req, (await ctx.params).streamId, true);
