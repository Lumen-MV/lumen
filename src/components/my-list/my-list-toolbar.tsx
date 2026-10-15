"use client";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { copy } from "@/lib/copy-vi";
import { cx } from "@/lib/format/class-names";
import type { MyListFilter, MyListSort, MyListView } from "@/lib/my-list/my-list-reducers";

type Props = { filter: MyListFilter; sort: MyListSort; view: MyListView; bulk: boolean; onFilter: (f: MyListFilter) => void; onSort: (s: MyListSort) => void; onView: (v: MyListView) => void; onBulk: (on: boolean) => void };

const FILTERS: Array<[MyListFilter, string]> = [["all", copy.myList.all], ["movie", copy.myList.movies], ["tv", copy.myList.series], ["cached", copy.myList.cached]];
const SORTS: MyListSort[] = ["added", "name", "year"];

/** `.tools > .chip(.on)×4 + .sp + .chip(sort ▾) + .chip ▦ + .chip ☰ + .chip Chọn|Xong` — my-list.html `tools()`. */
export function MyListToolbar({ filter, sort, view, bulk, onFilter, onSort, onView, onBulk }: Props) {
  const m = copy.myList;
  const chip = (key: string, label: string, on: boolean, onClick: () => void, data: Record<string, string>) => (
    <button key={key} type="button" className={cx("chip", on && "on")} aria-pressed={on} onClick={onClick} {...data}>
      {label}
    </button>
  );
  return (
    <div className="tools">
      {FILTERS.map(([f, label]) => chip(f, label, filter === f, () => onFilter(f), { "data-filter": f }))}
      <span className="sp" />
      <DropdownMenu
        anchor={
          <button type="button" className="chip" data-sort={sort} aria-haspopup="menu">
            {m.sort(m.sorts[SORTS.indexOf(sort)])}
          </button>
        }
        items={SORTS.map((s, i) => ({ label: m.sorts[i], onSelect: () => onSort(s) }))}
      />
      {chip("grid", m.grid, view === "grid", () => onView("grid"), { "data-view": "grid" })}
      {chip("list", m.list, view === "list", () => onView("list"), { "data-view": "list" })}
      {chip("bulk", bulk ? m.done : m.select, false, () => onBulk(!bulk), { "data-bulk": bulk ? "on" : "off" })}
    </div>
  );
}
