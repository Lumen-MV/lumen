import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/require-admin";
import { describeDeviceToken, revokeDeviceTokens, rotateDeviceToken, type DeviceTokenState } from "@/lib/auth/device-token";
import { logActivity } from "@/lib/activity/log-activity";
import { copy } from "@/lib/copy-vi";

export const dynamic = "force-dynamic";

/** Response of every verb: `{url, masked, revoked, lastUsedAt, createdAt, manifestUrl}` (`manifestUrl` = `url`, kept for the onboarding QR). */
const answer = (s: DeviceTokenState) => NextResponse.json({ url: s.url, masked: s.masked, revoked: s.revoked, lastUsedAt: s.lastUsedAt, createdAt: s.createdAt, manifestUrl: s.url }, { headers: { "cache-control": "no-store" } });

/** GET /api/me/device-token → current Stremio link (created on first call; `revoked:true` after "Thu hồi link"). */
export async function GET() {
  const me = await requireUserApi();
  if (me instanceof NextResponse) return me;
  try {
    return answer(describeDeviceToken(me.user.id));
  } catch (err) {
    console.error("[me/device-token GET]", err);
    return NextResponse.json({ code: "SERVER_ERROR" }, { status: 500 });
  }
}

/** POST /api/me/device-token → "Tạo link mới": revoke every live token and issue a fresh one. */
export async function POST() {
  const me = await requireUserApi();
  if (me instanceof NextResponse) return me;
  try {
    const state = rotateDeviceToken(me.user.id);
    logActivity("admin", copy.settings.tv.createdToast.replace("✓ ", `${me.user.displayName}: `), me.user.id);
    return answer(state);
  } catch (err) {
    console.error("[me/device-token POST]", err);
    return NextResponse.json({ code: "SERVER_ERROR" }, { status: 500 });
  }
}

/** DELETE /api/me/device-token → "Thu hồi link": the TV loses the Lumen rows until a new link is installed. */
export async function DELETE() {
  const me = await requireUserApi();
  if (me instanceof NextResponse) return me;
  try {
    revokeDeviceTokens(me.user.id);
    logActivity("admin", `${me.user.displayName}: ${copy.settings.tv.revokedToast}`, me.user.id);
    return answer(describeDeviceToken(me.user.id));
  } catch (err) {
    console.error("[me/device-token DELETE]", err);
    return NextResponse.json({ code: "SERVER_ERROR" }, { status: 500 });
  }
}
