"use client";
import { Button } from "@/components/ui/button";
import { copy } from "@/lib/copy-vi";

export type CenterOverlayKind = "loading-link" | "loading" | "buffering" | "stall" | "relink";

type Props = { kind: CenterOverlayKind; seconds?: number; onOpenApp: () => void; onOther: () => void };

/**
 * `.pcenter > div > .spin + .m [+ .hint]` — "Đang lấy link từ Torbox…" (before the manifest), "Đang tải…" (loading /
 * buffering), stall "Đang tải… (12 giây)" + hint with "📺 Xem bằng app" / "Chọn bản khác", relink "Đang lấy link mới…".
 */
export function PlayerCenterOverlay({ kind, seconds = 0, onOpenApp, onOther }: Props) {
  const p = copy.player;
  const text = kind === "loading-link" ? p.loadingLink : kind === "relink" ? p.relink : kind === "stall" ? p.loadingSec(seconds) : p.loading;
  return (
    <div className="pcenter" role="status" aria-live="polite" data-overlay={kind}>
      <div>
        <div className="spin" />
        <div className="m">{text}</div>
        {kind === "stall" && (
          <div className="hint">
            {p.stallHint}
            <br />
            <Button size="sm" data-action="open-app" onClick={onOpenApp}>
              {p.openApp}
            </Button>{" "}
            <Button size="sm" data-action="pick-other" onClick={onOther}>
              {p.other}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
