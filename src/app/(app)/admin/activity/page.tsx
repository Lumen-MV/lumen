import { AdminActivityPage } from "@/components/admin/admin-activity-page";
import { isActivityFilter } from "@/lib/admin/activity-filter-rules";
import { activityPeople, listActivity } from "@/lib/admin/admin-activity-service";

export const dynamic = "force-dynamic";

/** /admin/activity?kind=&userId= — Nhật ký hoạt động (admin.html `activity`); "Xem lịch sử xem" deep-links here with `kind=view&userId=`. */
export default async function AdminActivityRoute({ searchParams }: { searchParams: Promise<{ kind?: string; userId?: string }> }) {
  const { kind, userId: rawUser } = await searchParams;
  const filter = isActivityFilter(kind) ? kind : "all";
  const userId = rawUser && /^\d+$/.test(rawUser) ? Number(rawUser) : null;
  return <AdminActivityPage initial={listActivity({ filter, userId, month: null })} people={activityPeople()} filter={filter} userId={userId} />;
}
