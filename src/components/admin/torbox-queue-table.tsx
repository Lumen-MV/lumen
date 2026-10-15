"use client";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/status-chip";
import type { AdminQueue, QueueRow } from "@/lib/admin/admin-queue-service";
import { copy } from "@/lib/copy-vi";
import { cx } from "@/lib/format/class-names";

/** `.slots > i[.on] ×limit + "a/b slot"` */
export function SlotsIndicator({ active, limit }: { active: number; limit: number }) {
  return (
    <div className="slots" data-slots={`${active}/${limit}`}>
      {Array.from({ length: limit }, (_, i) => (
        <i key={i} className={cx(i < active && "on")} />
      ))}
      <span style={{ marginLeft: 8, color: "#888", fontSize: 13 }}>{copy.admin.queue.slots(active, limit)}</span>
    </div>
  );
}

export type QueueAction = "cancel" | "prioritize" | "retry" | "remove";
type Props = { queue: AdminQueue; onAction: (action: QueueAction, row: QueueRow) => void };

const progressCell = (r: QueueRow) =>
  r.state === "downloading" ? (
    <>
      <div className="mini" style={{ width: 160, height: 6 }} role="progressbar" aria-valuenow={r.progress} aria-valuemin={0} aria-valuemax={100}>
        <i style={{ width: `${r.progress}%`, height: 6 }} />
      </div>{" "}
      {r.progress}%
    </>
  ) : r.state === "queued" ? (
    <StatusChip kind="wait">{copy.admin.queue.queued}</StatusChip>
  ) : (
    <StatusChip kind="off">{copy.admin.queue.failed}</StatusChip>
  );

/** Active + failed rows in one table (Phim · Bản · Yêu cầu bởi · Tiến độ · Tốc độ · Còn lại · actions). */
export function TorboxQueueTable({ queue, onAction }: Props) {
  const q = copy.admin.queue;
  const rows = [...queue.active, ...queue.failed];
  return (
    <div className="tbl">
      <table style={{ marginBottom: 22 }} data-queue>
        <tbody>
          <tr>
            {q.cols.map((c) => (
              <th key={c}>{c}</th>
            ))}
            <th />
          </tr>
          {rows.map((r) => (
            <tr key={r.id} data-job={r.state} data-app-queued={r.appQueuePos !== null || undefined}>
              <td>{r.title}</td>
              <td>{r.release}</td>
              <td>{r.requestedBy}</td>
              <td>{progressCell(r)}</td>
              <td>{r.speedLabel}</td>
              <td>{r.etaLabel}</td>
              <td>
                {r.state === "error" ? (
                  <>
                    <Button size="sm" onClick={() => onAction("retry", r)}>{q.retry}</Button>{" "}
                    <Button size="sm" onClick={() => onAction("remove", r)}>{q.remove}</Button>
                  </>
                ) : (
                  <>
                    {r.appQueuePos !== null && (
                      <>
                        <Button size="sm" onClick={() => onAction("prioritize", r)}>{q.prioritize}</Button>{" "}
                      </>
                    )}
                    <Button size="sm" onClick={() => onAction("cancel", r)}>{q.cancel}</Button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** "Hoàn thành hôm nay · N" (Phim · Bản · Yêu cầu bởi · Xong lúc). */
export function CompletedTodayTable({ rows }: { rows: QueueRow[] }) {
  const q = copy.admin.queue;
  return (
    <>
      <div className="h">
        <h2 style={{ fontSize: 16 }}>{q.doneToday(rows.length)}</h2>
      </div>
      <div className="tbl">
        <table data-done-today>
          <tbody>
            <tr>
              {q.doneCols.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.title}</td>
                <td>{r.release}</td>
                <td>{r.requestedBy}</td>
                <td>{r.finishedLabel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
