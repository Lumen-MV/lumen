"use client";
import type { ReactNode } from "react";
import { cx } from "@/lib/format/class-names";

type Props = { on?: boolean; sel?: boolean; onClick?: () => void; children: ReactNode };

/** `.chip[.on][.sel]` — browse/search filter bar chips. */
export function FilterChip({ on, sel, onClick, children }: Props) {
  return (
    <span className={cx("chip", on && "on", sel && "sel")} role="button" tabIndex={0} aria-pressed={on} onClick={onClick} onKeyDown={(e) => e.key === "Enter" && onClick?.()}>
      {children}
    </span>
  );
}
