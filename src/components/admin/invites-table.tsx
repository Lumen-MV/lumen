"use client";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/status-chip";
import { copy } from "@/lib/copy-vi";
import { formatDate } from "@/lib/format/time-format";

export type InviteRowDto = { id: number; note: string; createdByName: string; expiresAt: string; state: "valid" | "used" | "expired" | "invalid"; usedByName: string; url: string | null; maskedUrl: string | null };
type Props = { invites: InviteRowDto[]; onCreate: () => void; onCopy: (inv: InviteRowDto) => void; onRevoke: (inv: InviteRowDto) => void; onRecreate: (inv: InviteRowDto) => void };

/** `.h(h2 + ＋ Tạo link mời) + table(Ghi chú · Link · Tạo bởi · Hết hạn · Trạng thái · actions)`; rows: Chưa dùng / Đã dùng · X / Hết hạn / Đã huỷ. */
export function InvitesTable({ invites, onCreate, onCopy, onRevoke, onRecreate }: Props) {
  const t = copy.admin.invites;
  const chip = (inv: InviteRowDto) => (inv.state === "valid" ? <StatusChip kind="wait">{t.unused}</StatusChip> : inv.state === "used" ? <StatusChip kind="ok">{t.used(inv.usedByName)}</StatusChip> : <StatusChip kind="off">{inv.state === "expired" ? t.expired : t.revoked}</StatusChip>);
  return (
    <>
      <div className="h">
        <h2 style={{ fontSize: 18 }}>{t.title}</h2>
        <Button variant="red" size="sm" onClick={onCreate}>
          {copy.admin.actions.invite}
        </Button>
      </div>
      <div className="tbl">
        <table style={{ marginBottom: 26 }} data-invites>
          <tbody>
            <tr>
              {t.cols.map((c) => (
                <th key={c}>{c}</th>
              ))}
              <th />
            </tr>
            {invites.length === 0 && (
              <tr>
                <td colSpan={6} style={{ color: "#777" }}>{t.empty}</td>
              </tr>
            )}
            {invites.map((inv) => (
              <tr key={inv.id} data-invite={inv.state}>
                <td>{inv.note}</td>
                <td>{inv.maskedUrl ? <code>{inv.maskedUrl}</code> : <span style={{ color: "#555" }}>{copy.admin.queue.dash}</span>}</td>
                <td>{inv.createdByName}</td>
                <td>{formatDate(new Date(inv.expiresAt))}</td>
                <td>{chip(inv)}</td>
                <td>
                  {inv.state === "valid" && (
                    <>
                      <Button size="sm" onClick={() => onCopy(inv)}>{t.copy}</Button>{" "}
                      <Button size="sm" onClick={() => onRevoke(inv)}>{t.cancel}</Button>
                    </>
                  )}
                  {(inv.state === "expired" || inv.state === "invalid") && <Button size="sm" onClick={() => onRecreate(inv)}>{t.recreate}</Button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
