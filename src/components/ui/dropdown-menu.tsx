"use client";
import * as RM from "@radix-ui/react-dropdown-menu";
import type { ReactNode } from "react";

export type MenuItem = { label: string; onSelect?: () => void; danger?: boolean; sep?: boolean };

type Props = { items: MenuItem[]; anchor: ReactNode; align?: "start" | "end"; /** override where focus goes when the menu closes (default: the trigger) */ onCloseAutoFocus?: (e: Event) => void };

/** `.menu2 > div[.on] / .sep` (Radix DropdownMenu for keyboard + outside-click). Trigger = `anchor`. */
export function DropdownMenu({ items, anchor, align = "end", onCloseAutoFocus }: Props) {
  return (
    <RM.Root modal={false}>
      <RM.Trigger asChild>{anchor}</RM.Trigger>
      <RM.Portal>
        <RM.Content className="menu2" align={align} sideOffset={8} loop onCloseAutoFocus={onCloseAutoFocus}>
          {items.map((it, i) =>
            it.sep ? (
              <RM.Separator key={`sep-${i}`} className="sep" />
            ) : (
              <RM.Item key={it.label} onSelect={it.onSelect} style={it.danger ? { color: "#f0a0a0" } : undefined}>
                {it.label}
              </RM.Item>
            ),
          )}
        </RM.Content>
      </RM.Portal>
    </RM.Root>
  );
}
