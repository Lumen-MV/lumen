"use client";
import { Dialog } from "@/components/ui/dialog";
import { copy } from "@/lib/copy-vi";
import type { CloudJob } from "@/lib/sources/sources-types";
import { shortFileName } from "./short-file-name";

/** `.dlg .card2` "Dừng tải bản này?" → "Tiếp tục tải" / `.btn.r` "Dừng" (picker-cancel). */
export function CancelDownloadDialog({ job, onClose, onStop }: { job: CloudJob | null; onClose: () => void; onStop: (job: CloudJob) => void }) {
  const p = copy.picker;
  return (
    <Dialog
      open={job !== null}
      onOpenChange={(o) => !o && onClose()}
      title={p.cancelTitle}
      body={job ? p.cancelText(shortFileName(job.fileName || job.title), job.progress) : ""}
      actions={[
        { label: p.keep },
        {
          label: p.stop,
          variant: "red",
          onClick: () => {
            if (job) onStop(job);
          },
        },
      ]}
    />
  );
}
