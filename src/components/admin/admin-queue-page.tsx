"use client";
import { useCallback, useEffect, useState } from "react";
import { EmptyBox } from "@/components/ui/empty-box";
import { useToast } from "@/components/ui/toast-provider";
import type { AdminQueue, QueueRow } from "@/lib/admin/admin-queue-service";
import { copy } from "@/lib/copy-vi";
import { CompletedTodayTable, SlotsIndicator, TorboxQueueTable, type QueueAction } from "./torbox-queue-table";

const POLL_MS = 5000;

/** /admin/queue — live table (polls GET /api/admin/queue every 5 s), slots, failed rows, done today; empty state when nothing is active. */
export function AdminQueuePage({ initial }: { initial: AdminQueue }) {
  const { toast } = useToast();
  const q = copy.admin.queue;
  const [queue, setQueue] = useState(initial);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/queue");
      if (res.ok) setQueue((await res.json()) as AdminQueue);
    } catch (err) {
      console.warn("[admin queue] poll", err); // handled: next tick retries
    }
  }, []);
  useEffect(() => {
    const t = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  const act = async (action: QueueAction, row: QueueRow) => {
    const req = action === "prioritize" ? fetch("/api/admin/queue", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: row.id, action }) }) : action === "retry" ? fetch(`/api/cloud/jobs/${row.id}/retry`, { method: "POST" }) : fetch(`/api/cloud/jobs/${row.id}`, { method: "DELETE" });
    try {
      const res = await req;
      if (!res.ok && res.status !== 404) throw new Error(`${action} ${row.id} → ${res.status}`);
    } catch (err) {
      console.error("[admin queue]", err);
      toast({ type: "err", text: copy.settings.errToast });
    }
    await refresh();
  };

  const empty = queue.active.length === 0 && queue.failed.length === 0;
  return (
    <>
      <div className="h">
        <h2 style={{ fontSize: 18 }}>{q.title}</h2>
        <SlotsIndicator active={queue.slots.active} limit={queue.slots.limit} />
      </div>
      {empty ? <EmptyBox title={q.emptyTitle} hint={q.emptyHint} /> : <TorboxQueueTable queue={queue} onAction={(a, r) => void act(a, r)} />}
      {!empty && <CompletedTodayTable rows={queue.doneToday} />}
    </>
  );
}
