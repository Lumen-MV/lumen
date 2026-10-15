"use client";
import * as RD from "@radix-ui/react-dialog";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { copy } from "@/lib/copy-vi";

/** "▶ Trailer" button → `.dlg > div > .yt(iframe youtube-nocookie) + Đóng` (detail.html `trailer`). */
export function TrailerDialog({ youtubeKey, title }: { youtubeKey: string; title: string }) {
  const [open, setOpen] = useState(false);
  const src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(youtubeKey)}?autoplay=1&rel=0`;
  return (
    <RD.Root open={open} onOpenChange={setOpen}>
      <RD.Trigger asChild>
        <Button data-action="trailer">{copy.detail.trailer}</Button>
      </RD.Trigger>
      <RD.Portal>
        <RD.Overlay className="dlg">
          <RD.Content aria-describedby={undefined}>
            <RD.Title className="sr-only" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
              {title}
            </RD.Title>
            <div className="yt">{open && <iframe src={src} title={title} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />}</div>
            <div style={{ textAlign: "right", marginTop: 8 }}>
              <RD.Close asChild>
                <Button size="sm">{copy.detail.closeTrailer}</Button>
              </RD.Close>
            </div>
          </RD.Content>
        </RD.Overlay>
      </RD.Portal>
    </RD.Root>
  );
}
