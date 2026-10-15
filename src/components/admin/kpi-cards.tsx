import { formatVnd } from "@/lib/format/format-vnd";
import type { AdminStats } from "@/lib/admin/admin-stats-service";
import { copy } from "@/lib/copy-vi";

/** `.kpis > .kpi(b + span) ×6` — members, watching now (live dot), views this month, AI subs, TorBox plan + slots, OS quota. */
export function KpiCards({ stats }: { stats: AdminStats }) {
  const k = copy.admin.kpi;
  const cards: Array<{ key: string; value: React.ReactNode; label: string }> = [
    { key: "members", value: stats.members.total, label: k.members(stats.members.active) },
    { key: "watching", value: <><span className="live" />{stats.watchingNow.length}</>, label: k.watching },
    { key: "views", value: stats.viewsMonth, label: k.views },
    { key: "ai", value: k.aiValue(stats.ai.count, formatVnd(stats.ai.costVnd)), label: k.ai },
    { key: "torbox", value: stats.torbox.plan, label: k.torbox(stats.torbox.active, stats.torbox.limit) },
    { key: "os", value: k.osValue(stats.os.used, stats.os.limit), label: k.os },
  ];
  return (
    <div className="kpis">
      {cards.map((c) => (
        <div className="kpi" key={c.key} data-kpi={c.key}>
          <b>{c.value}</b>
          <span>{c.label}</span>
        </div>
      ))}
    </div>
  );
}
