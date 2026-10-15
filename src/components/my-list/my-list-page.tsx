"use client";
import { useCallback, useReducer, useState } from "react";
import { ContinueWatchingRow } from "@/components/catalog/continue-watching-row";
import { useContinuePlay } from "@/components/catalog/use-continue-play";
import { EmptyBox } from "@/components/ui/empty-box";
import { useToast } from "@/components/ui/toast-provider";
import { copy } from "@/lib/copy-vi";
import { initialMyListState, myListReducer, visibleItems, type MyListItem } from "@/lib/my-list/my-list-reducers";
import type { ContinueItem } from "@/lib/play/player-manifest-types";
import { BulkActionBar } from "./bulk-action-bar";
import { ClearHistoryDialog } from "./clear-history-dialog";
import { MyListGrid } from "./my-list-grid";
import { MyListTable } from "./my-list-table";
import { MyListToolbar } from "./my-list-toolbar";

type Props = { continueItems: ContinueItem[]; items: MyListItem[] };

async function setSaved(mediaKey: string, saved: boolean): Promise<boolean> {
  const r = await fetch("/api/my-list", { method: saved ? "POST" : "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ mediaKey }) });
  return r.ok;
}

/**
 * /my-list (my-list.html, 8 states): "Tiếp tục xem" (wide cards + "Xoá lịch sử" → confirm → DELETE /api/progress?all=1,
 * empty box when nothing is in progress) and "Danh sách của tôi · N phim" (toolbar, grid with hover ✕ → toast + Hoàn tác,
 * bulk select + bulkbar, list-view table, empty state with "Khám phá phim").
 */
export function MyListPage({ continueItems: initialContinue, items }: Props) {
  const [s, dispatch] = useReducer(myListReducer, items, initialMyListState);
  const [continueItems, setContinueItems] = useState(initialContinue);
  const [clearOpen, setClearOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const { toast } = useToast();
  const { play, busyKey } = useContinuePlay();
  const m = copy.myList;

  const remove = useCallback(
    async (item: MyListItem) => {
      const index = s.items.findIndex((i) => i.mediaKey === item.mediaKey);
      dispatch({ type: "remove", mediaKeys: [item.mediaKey] });
      if (!(await setSaved(item.mediaKey, false).catch(() => false))) {
        dispatch({ type: "restore", item, index });
        return void toast({ type: "err", text: copy.home.errRow });
      }
      toast({ type: "success", text: m.removedToast(item.title), action: { label: copy.common.undo, onClick: () => void setSaved(item.mediaKey, true).then((ok) => ok && dispatch({ type: "restore", item, index })) } });
    },
    [s.items, toast, m],
  );
  const bulkRemove = useCallback(async () => {
    setBulkBusy(true);
    const keys = [...s.selected];
    const results = await Promise.all(keys.map((k) => setSaved(k, false).catch(() => false)));
    dispatch({ type: "remove", mediaKeys: keys.filter((_, i) => results[i]) });
    if (results.some((ok) => !ok)) toast({ type: "err", text: copy.home.errRow });
    dispatch({ type: "bulk", on: false });
    setBulkBusy(false);
  }, [s.selected, toast]);
  const clearHistory = useCallback(async () => {
    const r = await fetch("/api/progress?all=1", { method: "DELETE" }).catch(() => null);
    if (r?.ok) setContinueItems([]);
    else toast({ type: "err", text: copy.home.errRow });
  }, [toast]);

  const visible = visibleItems(s);
  const showContinue = continueItems.length > 0 || s.items.length > 0;
  return (
    <main data-my-list>
      {/* `main > section + section` like the mockup: the row's own <section> carries the 20px top margin — never nest it in another padded section (the heading / cards must align with the grid at 56px, 16px mobile) */}
      {showContinue &&
        (continueItems.length > 0 ? (
          <ContinueWatchingRow key={continueItems.length} items={continueItems} onItemsChange={setContinueItems} style={{ marginTop: 20 }} headerAction={<button type="button" className="clear" data-action="clear-history" onClick={() => setClearOpen(true)}>{m.clearHistory}</button>} />
        ) : (
          <section style={{ marginTop: 20 }}>
            <div className="h">
              <h2>{m.continue}</h2>
            </div>
            <EmptyBox title={m.emptyContinueTitle} hint={m.emptyContinueHint} />
          </section>
        ))}
      <section>
        <div className="h">
          <h2>{m.title(s.items.length)}</h2>
        </div>
        {s.items.length === 0 ? (
          <EmptyBox title={m.emptyTitle} hint={m.emptyHint} actionLabel={m.explore} actionHref="/" />
        ) : (
          <>
            <MyListToolbar filter={s.filter} sort={s.sort} view={s.view} bulk={s.bulk} onFilter={(f) => dispatch({ type: "filter", filter: f })} onSort={(sort) => dispatch({ type: "sort", sort })} onView={(view) => dispatch({ type: "view", view })} onBulk={(on) => dispatch({ type: "bulk", on })} />
            {s.view === "list" ? <MyListTable items={visible} busyKey={busyKey} onPlay={(it) => void play(it.mediaKey, false)} onRemove={(it) => void remove(it)} /> : <MyListGrid items={visible} bulk={s.bulk} selected={s.selected} onToggle={(k) => dispatch({ type: "toggle-select", mediaKey: k })} onRemove={(it) => void remove(it)} />}
          </>
        )}
      </section>
      {s.bulk && <BulkActionBar count={s.selected.length} busy={bulkBusy} onRemove={() => void bulkRemove()} onCancel={() => dispatch({ type: "bulk", on: false })} />}
      <ClearHistoryDialog open={clearOpen} count={continueItems.length} onClose={() => setClearOpen(false)} onConfirm={() => void clearHistory()} />
    </main>
  );
}
