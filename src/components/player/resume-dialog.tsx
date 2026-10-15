"use client";
import { useEffect, useRef, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { copy } from "@/lib/copy-vi";
import { formatClock } from "@/lib/format/time-format";
import type { ResumeDto } from "@/lib/play/player-manifest-types";

export const RESUME_COUNTDOWN_S = 5;

/** "Tiếp tục từ 1:01:12?" — "Xem từ đầu" / `.btn.w` "▶ Tiếp tục (5)" counting down; 0 = continue automatically. */
export function ResumeDialog({ resume, onContinue, onRestart }: { resume: ResumeDto | null; onContinue: () => void; onRestart: () => void }) {
  const [left, setLeft] = useState(RESUME_COUNTDOWN_S);
  // the parent passes a fresh arrow every render: read it through a ref so the countdown restarts only on a new offer
  const continueRef = useRef(onContinue);
  continueRef.current = onContinue;
  useEffect(() => {
    if (!resume) return;
    setLeft(RESUME_COUNTDOWN_S);
    const started = Date.now();
    const id = setInterval(() => {
      const n = RESUME_COUNTDOWN_S - Math.floor((Date.now() - started) / 1000);
      if (n <= 0) {
        clearInterval(id);
        continueRef.current();
      } else setLeft(n);
    }, 250);
    return () => clearInterval(id);
  }, [resume]);
  const r = copy.player.resume;
  return (
    <Dialog
      open={resume !== null}
      onOpenChange={(o) => !o && onContinue()}
      title={r.title(formatClock(resume?.positionS ?? 0))}
      body={r.text(resume?.percent ?? 0, resume?.device ?? "", resume?.when ?? "")}
      variant="info"
      actions={[
        { label: r.restart, onClick: onRestart, keepOpen: true },
        { label: r.go(left), variant: "white", onClick: onContinue, keepOpen: true },
      ]}
    />
  );
}
