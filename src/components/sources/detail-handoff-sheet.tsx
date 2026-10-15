"use client";
import { useState } from "react";
import { HandoffSheet } from "@/components/player/handoff-sheet";
import { HandoffSentDialog, QrDialog } from "@/components/player/player-dialogs";
import { useHandoffActions } from "@/components/player/use-handoff-actions";
import { parseMediaKey } from "@/lib/catalog/media-key";
import { resumeQrUrl } from "@/lib/play/external-player-links";

/**
 * Detail / picker "📺 Xem bằng app": the player's hand-off sheet anchored bottom-right of the viewport (the `.sheet2`
 * offsets are relative to this fixed layer) + the "Đã gửi tới …" and QR dialogs. `streamId` = the just-resolved handle.
 */
export function DetailHandoffSheet({ streamId, mediaKey, onClose }: { streamId: string | null; mediaKey: string; onClose: () => void }) {
  const [sentApp, setSentApp] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const handoff = useHandoffActions(streamId, setSentApp, onClose);
  const showQr = () => {
    const key = parseMediaKey(mediaKey);
    if (key) setQrUrl(resumeQrUrl(window.location.origin, key, 0));
    onClose();
  };
  return (
    <>
      {streamId && (
        <div style={{ position: "fixed", inset: 0, zIndex: 35, pointerEvents: "none" }} data-detail-handoff>
          <div style={{ position: "absolute", inset: 0, pointerEvents: "auto" }}>
            <HandoffSheet onApp={handoff.openApp} onCopy={handoff.copyLink} onCopySub={handoff.copySubLink} onQr={showQr} onClose={onClose} />
          </div>
        </div>
      )}
      <HandoffSentDialog app={sentApp} onClose={() => setSentApp(null)} />
      <QrDialog url={qrUrl} positionS={0} onClose={() => setQrUrl(null)} />
    </>
  );
}
