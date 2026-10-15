"use client";
import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/filter-chip";
import { StatusChip } from "@/components/ui/status-chip";
import type { MemberFilter, MemberRow } from "@/lib/admin/admin-users-service";
import { copy } from "@/lib/copy-vi";
import { MemberActionsMenu, type MemberAction } from "./member-actions-menu";

type ToolbarProps = { q: string; filter: MemberFilter; onQuery: (q: string) => void; onFilter: (f: MemberFilter) => void };

/** `.toolbar > input + .chip[.on] ×4` (Tất cả / Hoạt động / Đã khoá / Chưa kích hoạt). */
export function MembersToolbar({ q, filter, onQuery, onFilter }: ToolbarProps) {
  const m = copy.admin.members;
  return (
    <div className="toolbar">
      <input placeholder={m.searchPh} value={q} aria-label={m.searchPh} onChange={(e) => onQuery(e.target.value)} />
      {m.filterKeys.map((key, i) => (
        <FilterChip key={key} on={filter === key} onClick={() => onFilter(key)}>
          {m.filters[i]}
        </FilterChip>
      ))}
    </div>
  );
}

type TableProps = { members: MemberRow[]; meId: number; onAction: (action: MemberAction, member: MemberRow) => void };

/**
 * Members table (Mobbin revision): name + username in one cell, 7 columns, a single bordered ⋯ per active member; locked
 * rows add "Mở khoá", never-logged-in rows add "Gửi lại link". Sorted by "Lượt xem/tháng ▾" (server).
 */
export function MembersTable({ members, meId, onAction }: TableProps) {
  const m = copy.admin.members;
  return (
    <div className="tbl">
      <table data-members>
        <tbody>
          <tr>
            {m.cols.map((c) => (
              <th key={c}>{c}</th>
            ))}
            <th />
          </tr>
          {members.length === 0 && (
            <tr>
              <td colSpan={8} style={{ color: "#777" }}>{m.empty}</td>
            </tr>
          )}
          {members.map((u) => (
            <tr key={u.id} data-member={u.username} data-status={u.status}>
              <td>
                <b>{u.displayName}</b>
                <div style={{ color: "#777", fontSize: 12 }}>{u.username}</div>
              </td>
              <td>{u.role === "admin" ? copy.settings.profile.admin : copy.settings.profile.member}</td>
              <td>
                {u.lastActivity.kind === "watching" && <span className="live" />}
                {u.lastActivity.text}
              </td>
              <td>{u.viewsMonth}</td>
              <td>{u.quality}</td>
              <td>{u.devices}</td>
              <td>
                <StatusChip kind={u.status}>{m.status[u.status]}</StatusChip>
              </td>
              <td className="acts">
                {u.status === "off" && <Button size="sm" onClick={() => onAction("unlock", u)}>{m.unlock}</Button>}
                {u.status === "wait" && <Button size="sm" onClick={() => onAction("resend", u)}>{m.resend}</Button>}
                <MemberActionsMenu member={u} isSelf={u.id === meId} onAction={(a) => onAction(a, u)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
