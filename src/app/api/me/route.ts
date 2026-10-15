import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/require-admin";
import { activeJobsSummary } from "@/lib/cloud/cloud-jobs-store";
import { getUserSettings } from "@/lib/users/user-settings";
import { countUnreadNotifications } from "@/lib/notifications/count-unread";

/** GET /api/me → {user, settings, unreadNotifications, activeCloudJobs, activeJob:{title, progress}|null} */
export async function GET() {
  const me = await requireUserApi();
  if (me instanceof NextResponse) return me;
  try {
    return NextResponse.json({ user: me.user, settings: getUserSettings(me.user.id), unreadNotifications: countUnreadNotifications(me.user.id), ...activeJobsSummary(me.user.id) });
  } catch (err) {
    console.error("[me]", err);
    return NextResponse.json({ code: "SERVER_ERROR" }, { status: 500 });
  }
}
