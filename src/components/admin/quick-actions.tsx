"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { copy } from "@/lib/copy-vi";
import { CreateInviteDialog, type CreatedInvite } from "./create-invite-dialog";
import { InviteResultDialog } from "./invite-result-dialog";

export const monthParam = (d = new Date()): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

/** Dashboard buttons: ＋ Tạo link mời (create → result dialogs), Xem hàng đợi, Xuất báo cáo tháng (CSV). */
export function QuickActions() {
  const router = useRouter();
  const a = copy.admin.actions;
  const [createOpen, setCreateOpen] = useState(false);
  const [created, setCreated] = useState<CreatedInvite | null>(null);
  return (
    <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
      <Button variant="red" size="sm" onClick={() => setCreateOpen(true)}>
        {a.invite}
      </Button>
      <Button size="sm" onClick={() => router.push(copy.admin.tabHrefs[2])}>
        {a.queue}
      </Button>
      <Button size="sm" onClick={() => window.location.assign(`/api/admin/activity.csv?month=${monthParam()}`)}>
        {a.exportMonth}
      </Button>
      <CreateInviteDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={setCreated} />
      <InviteResultDialog invite={created} onClose={() => setCreated(null)} />
    </div>
  );
}
