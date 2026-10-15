"use client";
import { Button } from "@/components/ui/button";
import { copy } from "@/lib/copy-vi";
import { useLikeToggle } from "./use-media-toggles";

/** Detail hero `.btn.round` 👍 — white background when liked (mockup: "white when active"). */
export function LikeButton({ mediaKey, liked: initial }: { mediaKey: string; liked: boolean }) {
  const { liked, pending, toggle } = useLikeToggle(mediaKey, initial);
  return (
    <Button variant="round" className={liked ? "w" : undefined} title={copy.detail.likeTip} aria-pressed={liked} aria-label={copy.detail.likeTip} disabled={pending} onClick={toggle} data-liked={liked}>
      {copy.detail.like}
    </Button>
  );
}
