"use client";
import { Button } from "@/components/ui/button";
import { copy } from "@/lib/copy-vi";
import type { CloudJob, PlayClass } from "@/lib/sources/sources-types";

export type RowActionKind = "play" | "app" | "cloud" | "cancel" | "retry" | "other";
type Props = { cacheState: "cached" | "uncached"; playClass: PlayClass; job?: CloudJob; episode?: number; busy?: boolean; disabled?: boolean; onAction: (kind: RowActionKind) => void };

/**
 * `.act` buttons per srcRow(): downloading/queued → "Huỷ" · error → "Thử lại" + "Chọn bản khác" · uncached → "⬇ Tải lên cloud"
 * · cached direct → `.btn.w.sm` "▶ Phát" · maybe → "▶ Thử phát" (episode: "▶ Thử phát T1") · app → "📺 Mở bằng app".
 */
export function SourceRowAction({ cacheState, playClass, job, episode, busy, disabled, onAction }: Props) {
  const p = copy.picker;
  const common = { size: "sm" as const, loading: busy, disabled };
  if (job?.state === "downloading" || job?.state === "queued") return <Button {...common} data-action="cancel" onClick={() => onAction("cancel")}>{p.cancel}</Button>;
  if (job?.state === "error")
    return (
      <>
        <Button {...common} data-action="retry" onClick={() => onAction("retry")}>{p.retry}</Button>
        <Button {...common} data-action="other" onClick={() => onAction("other")}>{p.other}</Button>
      </>
    );
  if (cacheState === "uncached") return <Button {...common} data-action="cloud" onClick={() => onAction("cloud")}>{p.cloud}</Button>;
  if (playClass === "direct") return <Button {...common} variant="white" data-action="play" onClick={() => onAction("play")}>{p.play}</Button>;
  if (playClass === "maybe") return <Button {...common} variant={episode !== undefined ? "white" : "default"} data-action="play" onClick={() => onAction("play")}>{episode !== undefined ? p.tryPlayEp(episode) : p.tryPlay}</Button>;
  return <Button {...common} data-action="app" onClick={() => onAction("app")}>{p.openApp}</Button>;
}

/** The Enter-key / primary action of a row (same table). */
export function primaryRowAction(cacheState: "cached" | "uncached", playClass: PlayClass, job?: CloudJob): RowActionKind {
  if (job?.state === "downloading" || job?.state === "queued") return "cancel";
  if (job?.state === "error") return "retry";
  if (cacheState === "uncached") return "cloud";
  return playClass === "app" ? "app" : "play";
}
