import { NextResponse } from "next/server";
import { logActivity } from "@/lib/activity/log-activity";
import { notifyAdmins } from "@/lib/notifications/notify-admins";
import { requireUserApi } from "@/lib/auth/require-admin";
import { copy } from "@/lib/copy-vi";
import { parseMediaKeyBody } from "@/lib/http/media-key-body";
import { sourcesErrorResponse } from "@/lib/http/sources-route-helpers";
import { throttleRequest } from "@/lib/sources/request-throttle";
import { mediaKeyOf, titleInfo } from "@/lib/sources/sources-service";

/**
 * POST /api/sources/request {mediaKey} → "Yêu cầu thêm phim này": one activity_log row the admin sees in
 * "Nhật ký hoạt động" + a `title_request` notification for every admin. Throttled to one row per minute per (user, title)
 * → 429 RATE_LIMITED (the client treats it as "already sent"). No external request is made.
 */
export async function POST(req: Request) {
  const me = await requireUserApi();
  if (me instanceof NextResponse) return me;
  const key = await parseMediaKeyBody(req);
  if (key instanceof NextResponse) return key;
  if (throttleRequest(me.user.id, mediaKeyOf(key))) return NextResponse.json({ code: "RATE_LIMITED" }, { status: 429 });
  try {
    const { title } = await titleInfo(key);
    const name = me.user.displayName || me.user.username;
    logActivity("admin", copy.cloud.activityRequest(name, title), me.user.id);
    notifyAdmins({ type: "title_request", title: copy.admin.notifyRequest(name, title), mediaType: key.type, tmdbId: key.tmdbId, season: key.season ?? null, episode: key.episode ?? null });
    return NextResponse.json({ ok: true, title });
  } catch (err) {
    return sourcesErrorResponse("sources/request", err);
  }
}
