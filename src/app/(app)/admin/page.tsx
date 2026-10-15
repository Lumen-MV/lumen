import { KpiCards } from "@/components/admin/kpi-cards";
import { QuickActions } from "@/components/admin/quick-actions";
import { ViewsBarChart, WatchingNowCard } from "@/components/admin/views-bar-chart";
import { getAdminStats } from "@/lib/admin/admin-stats-service";
import { currentScenario } from "@/lib/dev/scenario-flags-server";

export const dynamic = "force-dynamic";

/** /admin — Tổng quan: six KPI cards, 30-day bar chart + "Đang xem lúc này", quick actions (admin.html `dashboard`). */
export default async function AdminDashboardPage() {
  const stats = await getAdminStats(await currentScenario());
  return (
    <>
      <KpiCards stats={stats} />
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 18 }} className="dashgrid">
        <ViewsBarChart bars={stats.bars} />
        <WatchingNowCard items={stats.watchingNow} />
      </div>
      <QuickActions />
    </>
  );
}
