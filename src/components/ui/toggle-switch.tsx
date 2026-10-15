"use client";
import { cx } from "@/lib/format/class-names";

type Props = { on: boolean; onChange: (on: boolean) => void; label?: string };

/** `.sw[.on]` (settings rows) — 40×22 switch, green when on. */
export function ToggleSwitch({ on, onChange, label }: Props) {
  return <span className={cx("sw", on && "on")} role="switch" aria-checked={on} aria-label={label} tabIndex={0} onClick={() => onChange(!on)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onChange(!on)} />;
}
