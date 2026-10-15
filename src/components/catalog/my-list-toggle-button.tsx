"use client";
import { Button } from "@/components/ui/button";
import { copy } from "@/lib/copy-vi";
import { useMyListToggle } from "./use-media-toggles";

type ToggleProps = { mediaKey: string; title: string; saved: boolean };

/** Detail hero `.btn.round` ＋ ⇄ ✓ (title "Danh sách của tôi"). */
export function MyListToggleButton({ mediaKey, title, saved: initial }: ToggleProps) {
  const { saved, pending, toggle } = useMyListToggle(mediaKey, title, initial);
  return (
    <Button variant="round" title={copy.detail.listTip} aria-pressed={saved} aria-label={copy.detail.listTip} disabled={pending} onClick={toggle} data-saved={saved}>
      {saved ? copy.detail.check : copy.detail.plus}
    </Button>
  );
}

/** Hero banner text button: "＋ Danh sách" ⇄ "✓ Đã lưu". */
export function HeroMyListButton({ mediaKey, title, saved: initial }: ToggleProps) {
  const { saved, pending, toggle } = useMyListToggle(mediaKey, title, initial);
  return (
    <Button aria-pressed={saved} disabled={pending} onClick={toggle} data-saved={saved}>
      {saved ? copy.home.savedList : copy.home.addList}
    </Button>
  );
}
