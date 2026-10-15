"use client";
import { Button } from "@/components/ui/button";
import { copy } from "@/lib/copy-vi";

type NoAudioProps = { kind: "no-audio"; onOpenApp: () => void; onOther: () => void };
type OfflineProps = { kind: "offline"; remainingS: number; onRetry: () => void };

/**
 * no-audio → `.pbanner.banner.warn` (bottom, above the controls) with "📺 Xem bằng app" / "Chọn bản khác";
 * offline → `.banner.err` pinned to the top with the buffered seconds left + "Thử lại".
 */
export function PlayerBanner(props: NoAudioProps | OfflineProps) {
  const p = copy.player;
  if (props.kind === "offline") {
    return (
      <div className="banner err" style={{ position: "absolute", left: 0, right: 0, top: 0, zIndex: 3 }} role="alert" data-banner="offline">
        {p.offline(props.remainingS)}{" "}
        <Button size="sm" onClick={props.onRetry}>
          {copy.common.retry}
        </Button>
      </div>
    );
  }
  return (
    <div className="pbanner banner warn" role="alert" data-banner="no-audio">
      {p.noAudio}{" "}
      <Button size="sm" data-action="open-app" onClick={props.onOpenApp}>
        {p.openApp}
      </Button>
      <Button size="sm" data-action="pick-other" onClick={props.onOther}>
        {p.other}
      </Button>
    </div>
  );
}
