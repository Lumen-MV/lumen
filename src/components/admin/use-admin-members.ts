"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui/toast-provider";
import type { MemberFilter, MemberRow } from "@/lib/admin/admin-users-service";
import { copy } from "@/lib/copy-vi";
import type { MemberAction } from "./member-actions-menu";

export type MemberDialog = { kind: "reset"; member: MemberRow; tempPassword: string; loginUrl?: string } | { kind: "lock"; member: MemberRow } | { kind: "delete"; member: MemberRow } | null;
type PatchAction = "lock" | "unlock" | "role" | "resend" | "revoke-stremio";

async function api(method: string, path: string, body?: unknown): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  const res = await fetch(path, { method, headers: body === undefined ? undefined : { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { ok: res.ok, status: res.status, json: ((await res.json().catch(() => ({}))) as Record<string, unknown>) ?? {} };
}

/** Members list state (search / filter re-query the server, debounced 250 ms) + every ⋯ / button action and its dialog. */
export function useAdminMembers(initial: MemberRow[]) {
  const router = useRouter();
  const { toast } = useToast();
  const m = copy.admin.members;
  const [members, setMembers] = useState(initial);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<MemberFilter>("all");
  const [dialog, setDialog] = useState<MemberDialog>(null);
  const first = useRef(true);

  const refresh = useCallback(async (query = q, f = filter) => {
    const r = await api("GET", `/api/admin/users?q=${encodeURIComponent(query)}&filter=${f}`);
    if (r.ok) setMembers(r.json.members as MemberRow[]);
  }, [q, filter]);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => void refresh(q, filter), 250);
    return () => clearTimeout(t);
  }, [q, filter, refresh]);

  const fail = (r: { status: number; json: Record<string, unknown> }) => {
    const code = r.json.code;
    toast({ type: "err", text: code === "SELF" ? m.selfToast : code === "LAST_ADMIN" ? m.lastAdminToast : code === "ALREADY_ACTIVE" ? m.alreadyActiveToast : copy.settings.errToast });
  };
  const patch = async (member: MemberRow, action: PatchAction, done: string, role?: "admin" | "member") => {
    const r = await api("PATCH", "/api/admin/users", { id: member.id, action, role });
    if (!r.ok) return fail(r);
    // "Gửi lại link": a fresh temp password + the login link, shown once in the reset dialog
    if (action === "resend") setDialog({ kind: "reset", member, tempPassword: r.json.tempPassword as string, loginUrl: r.json.loginUrl as string });
    else toast({ type: "success", text: done });
    await refresh();
  };

  const act = async (action: MemberAction, member: MemberRow) => {
    switch (action) {
      case "reset": {
        const r = await api("POST", `/api/admin/users/${member.id}/reset-password`);
        return r.ok ? setDialog({ kind: "reset", member, tempPassword: r.json.tempPassword as string }) : fail(r);
      }
      case "role-admin":
        return patch(member, "role", m.roleToast(member.displayName, copy.settings.profile.admin), "admin");
      case "role-member":
        return patch(member, "role", m.roleToast(member.displayName, copy.settings.profile.member), "member");
      case "history":
        return router.push(`${copy.admin.tabHrefs[3]}?kind=view&userId=${member.id}`);
      case "revoke-stremio":
        return patch(member, "revoke-stremio", m.revokedToast(member.displayName));
      case "unlock":
        return patch(member, "unlock", m.unlockedToast(member.displayName));
      case "resend":
        return patch(member, "resend", "");
      case "lock":
        return setDialog({ kind: "lock", member });
      case "delete":
        return setDialog({ kind: "delete", member });
    }
  };
  const confirmLock = async (member: MemberRow) => {
    await patch(member, "lock", m.lockedToast(member.displayName));
    setDialog(null);
  };
  const confirmDelete = async (member: MemberRow) => {
    const r = await api("DELETE", `/api/admin/users/${member.id}`, { confirm: member.username });
    if (!r.ok) fail(r);
    else toast({ type: "success", text: m.deletedToast(member.displayName) });
    setDialog(null);
    await refresh();
  };

  return { members, q, setQ, filter, setFilter, dialog, setDialog, act, confirmLock, confirmDelete, refresh };
}
