"use client";
import { copy } from "@/lib/copy-vi";
import { Icon } from "@/lib/icons";

/** `.ptop > svg.ico(back)` — the mockup's top gradient bar; the arrow saves progress and returns to the detail page. */
export function PlayerTopBar({ onBack, hidden }: { onBack: () => void; hidden: boolean }) {
  return (
    <div className="ptop" style={hidden ? { display: "none" } : undefined}>
      <button type="button" className="ib" aria-label={copy.player.aria.back} data-action="back" onClick={onBack}>
        <Icon name="back" />
      </button>
    </div>
  );
}
