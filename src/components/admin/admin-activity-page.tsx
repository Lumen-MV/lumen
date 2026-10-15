"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, type MenuItem } from "@/components/ui/dropdown-menu";
import { FilterChip } from "@/components/ui/filter-chip";
import type { ActivityEntry, ActivityFilter } from "@/lib/admin/activity-filter-rules";
import { copy } from "@/lib/copy-vi";
import { renderBold } from "@/lib/format/render-bold";

export type Person = { id: number; name: string };
type Props = { initial: ActivityEntry[]; people: Person[]; filter: ActivityFilter; userId: number | null };

const query = (filter: ActivityFilter, userId: number | null) => `kind=${filter}${userId ? `&userId=${userId}` : ""}`;

/** /admin/activity — `.toolbar` (kind chips + "Người: … ▾" + Xuất CSV) and the `.tl` timeline; filters re-query GET /api/admin/activity. */
export function AdminActivityPage({ initial, people, filter: initialFilter, userId: initialUser }: Props) {
  const a = copy.admin.activity;
  const [entries, setEntries] = useState(initial);
  const [filter, setFilter] = useState<ActivityFilter>(initialFilter);
  const [userId, setUserId] = useState<number | null>(initialUser);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const ctrl = new AbortController();
    fetch(`/api/admin/activity?${query(filter, userId)}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { entries: ActivityEntry[] }) => setEntries(d.entries))
      .catch((err) => err?.name !== "AbortError" && console.error("[activity]", err));
    window.history.replaceState(null, "", `${copy.admin.tabHrefs[3]}?${query(filter, userId)}`);
    return () => ctrl.abort();
  }, [filter, userId]);

  const personItems: MenuItem[] = [{ label: a.personAll, onSelect: () => setUserId(null) }, ...people.map((p) => ({ label: p.name, onSelect: () => setUserId(p.id) }))];
  const personLabel = userId === null ? a.person : a.personNamed(people.find((p) => p.id === userId)?.name ?? String(userId));

  return (
    <>
      <div className="toolbar">
        {a.filterKinds.map((k, i) => (
          <FilterChip key={k} on={filter === k} onClick={() => setFilter(k)}>
            {a.filters[i]}
          </FilterChip>
        ))}
        <span style={{ flex: 1 }} />
        <DropdownMenu items={personItems} anchor={<span className="chip" role="button" tabIndex={0} data-person-filter>{personLabel}</span>} />
        <Button size="sm" onClick={() => window.location.assign(`/api/admin/activity.csv?${query(filter, userId)}`)}>
          {a.exportCsv}
        </Button>
      </div>
      <div className="tl" data-activity>
        {entries.length === 0 && <div style={{ color: "#777" }}>{a.empty}</div>}
        {entries.map((e) => (
          <div key={e.id} data-kind={e.kind}>
            <small>{e.time}</small>
            {renderBold(e.html)}
          </div>
        ))}
      </div>
    </>
  );
}
