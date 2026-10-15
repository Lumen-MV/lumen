"use client";
import { Dialog } from "@/components/ui/dialog";
import { copy } from "@/lib/copy-vi";

export type ActiveJobSummary = { title: string; progress: number };

/** `.dlg .card2` "Đăng xuất?" shown when the user has an active cloud job (login.html?state=logout-confirm). */
export function LogoutConfirmDialog({ job, onStay, onLogout }: { job: ActiveJobSummary | null; onStay: () => void; onLogout: () => void }) {
  const c = copy.logoutConfirm;
  return (
    <Dialog
      open={job !== null}
      onOpenChange={(o) => !o && onStay()}
      title={c.title}
      body={job ? c.text(job.title, job.progress) : ""}
      actions={[
        { label: c.stay },
        { label: c.logout, variant: "red", onClick: onLogout, keepOpen: true },
      ]}
    />
  );
}
