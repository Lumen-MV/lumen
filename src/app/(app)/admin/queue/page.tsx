import { AdminQueuePage } from "@/components/admin/admin-queue-page";
import { getAdminQueue } from "@/lib/admin/admin-queue-service";
import { currentScenario } from "@/lib/dev/scenario-flags-server";

export const dynamic = "force-dynamic";

/** /admin/queue — Hàng đợi Torbox (admin.html `queue` / `queue-empty`). */
export default async function AdminQueueRoute() {
  return <AdminQueuePage initial={await getAdminQueue(await currentScenario())} />;
}
