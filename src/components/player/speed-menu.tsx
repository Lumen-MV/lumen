"use client";
import * as RM from "@radix-ui/react-dropdown-menu";
import { copy } from "@/lib/copy-vi";
import { cx } from "@/lib/format/class-names";
import { Icon } from "@/lib/icons";

export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

/** Speed icon → `.menu2` 0.5–2× (Radix dropdown; `.on` marks the current rate). `onOpenChange` locks the auto-hide. */
export function SpeedMenu({ rate, onRate, onOpenChange }: { rate: number; onRate: (r: number) => void; onOpenChange: (o: boolean) => void }) {
  return (
    <RM.Root modal={false} onOpenChange={onOpenChange}>
      <RM.Trigger asChild>
        <button type="button" className="ib" aria-label={copy.player.aria.speed} data-action="speed" data-rate={rate}>
          <Icon name="speed" />
        </button>
      </RM.Trigger>
      <RM.Portal>
        <RM.Content className="menu2" align="end" side="top" sideOffset={12} loop>
          <div className="hint">{copy.player.speedTitle}</div>
          {SPEEDS.map((s, i) => (
            <RM.Item key={s} className={cx(s === rate && "on")} data-speed={s} onSelect={() => onRate(s)}>
              {copy.player.speeds[i]}
            </RM.Item>
          ))}
        </RM.Content>
      </RM.Portal>
    </RM.Root>
  );
}
