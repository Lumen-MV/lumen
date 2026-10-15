"use client";
import type { KeyboardEvent } from "react";
import { cx } from "@/lib/format/class-names";

export type SegmentOption<T extends string> = { value: T; label: string };

type Props<T extends string> = { options: SegmentOption<T>[]; value: T; onChange: (v: T) => void; label?: string };

/** Radio-group keyboard contract: ← ↑ / → ↓ move (and select) with wrap-around, Home / End jump, Space / Enter select; one tab stop. */
export function segmentKeyDown<T extends string>(e: KeyboardEvent<HTMLElement>, options: SegmentOption<T>[], value: T, onChange: (v: T) => void): void {
  const i = Math.max(0, options.findIndex((o) => o.value === value));
  const pick = (idx: number) => {
    e.preventDefault();
    const next = options[(idx + options.length) % options.length];
    onChange(next.value);
    (e.currentTarget.parentElement?.children[(idx + options.length) % options.length] as HTMLElement | undefined)?.focus();
  };
  if (e.key === "ArrowRight" || e.key === "ArrowDown") pick(i + 1);
  else if (e.key === "ArrowLeft" || e.key === "ArrowUp") pick(i - 1);
  else if (e.key === "Home") pick(0);
  else if (e.key === "End") pick(options.length - 1);
  else if (e.key === " " || e.key === "Enter") {
    e.preventDefault();
    onChange(options[i].value);
  }
}

/** `.seg > span[.on]` (settings page) — roving tabindex: only the selected option is tabbable, arrows move within. */
export function SegmentedControl<T extends string>({ options, value, onChange, label }: Props<T>) {
  const current = options.some((o) => o.value === value) ? value : options[0]?.value;
  return (
    <span className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <span key={o.value} className={cx(o.value === current && "on")} role="radio" aria-checked={o.value === current} tabIndex={o.value === current ? 0 : -1} onClick={() => onChange(o.value)} onKeyDown={(e) => segmentKeyDown(e, options, current, onChange)}>
          {o.label}
        </span>
      ))}
    </span>
  );
}
