import { Fragment } from "react";
import type { AdminStats } from "@/lib/admin/admin-stats-service";
import { copy } from "@/lib/copy-vi";

const labelRow = { display: "flex", justifyContent: "space-between", color: "#666", fontSize: 11 } as const;

/** `.kpi > span + .bars(i ×30) + first/last day labels` — bar height = count / max (an empty month shows a flat baseline). */
export function ViewsBarChart({ bars }: { bars: AdminStats["bars"] }) {
  const max = Math.max(1, ...bars.map((b) => b.count));
  return (
    <div className="kpi" data-chart>
      <span>{copy.admin.kpi.chart}</span>
      <div className="bars">
        {bars.map((b) => (
          <i key={b.date} style={{ height: `${b.count ? Math.max(4, Math.round((b.count / max) * 100)) : 2}%` }} title={`${b.label} · ${b.count}`} />
        ))}
      </div>
      <div style={labelRow}>
        <span>{bars[0]?.label}</span>
        <span>{bars[bars.length - 1]?.label}</span>
      </div>
    </div>
  );
}

/** `.kpi > span + list` — "● Admin · Hành Tinh Cát: Phần Hai · 1:02" one per line. */
export function WatchingNowCard({ items }: { items: AdminStats["watchingNow"] }) {
  const k = copy.admin.kpi;
  return (
    <div className="kpi" data-watching-now>
      <span>{k.watchingNow}</span>
      <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.9 }}>
        {items.length === 0 && <span style={{ color: "#666" }}>{k.nobody}</span>}
        {items.map((w, i) => (
          <Fragment key={w.userId}>
            {i > 0 && <br />}
            {k.bullet}
            {w.name} · {w.title} · {w.detail}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
