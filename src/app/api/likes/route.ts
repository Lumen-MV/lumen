import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/require-admin";
import { setLike } from "@/lib/catalog/user-media-flags";
import { parseMediaKeyBody } from "@/lib/http/media-key-body";

/** POST/DELETE /api/likes {mediaKey} → {liked:boolean} */
async function toggle(req: Request, liked: boolean) {
  const me = await requireUserApi();
  if (me instanceof NextResponse) return me;
  const key = await parseMediaKeyBody(req);
  if (key instanceof NextResponse) return key;
  try {
    return NextResponse.json({ liked: setLike(me.user.id, key, liked) });
  } catch (err) {
    console.error("[likes]", err);
    return NextResponse.json({ code: "SERVER_ERROR" }, { status: 500 });
  }
}

export const POST = (req: Request) => toggle(req, true);
export const DELETE = (req: Request) => toggle(req, false);
