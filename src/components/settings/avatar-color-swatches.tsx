"use client";
import { cx } from "@/lib/format/class-names";
import { AVATAR_SWATCHES } from "@/lib/users/avatar-swatches";

type Props = { value: string; onChange: (color: string) => void; label: string };

/** `.swatch > i[.on] ×8` — the mockup's eight avatar colours; keyboard: arrows move, Enter/Space picks. */
export function AvatarColorSwatches({ value, onChange, label }: Props) {
  return (
    <div className="swatch" role="radiogroup" aria-label={label}>
      {AVATAR_SWATCHES.map((c) => (
        <i
          key={c}
          style={{ background: c, cursor: "pointer" }}
          className={cx(c === value && "on")}
          role="radio"
          aria-checked={c === value}
          aria-label={c}
          tabIndex={c === value ? 0 : -1}
          data-color={c}
          onClick={() => onChange(c)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onChange(c);
            } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
              e.preventDefault();
              const i = AVATAR_SWATCHES.indexOf(c);
              const next = AVATAR_SWATCHES[(i + (e.key === "ArrowRight" ? 1 : AVATAR_SWATCHES.length - 1)) % AVATAR_SWATCHES.length];
              onChange(next);
              (e.currentTarget.parentElement?.querySelector(`[data-color="${next}"]`) as HTMLElement | null)?.focus();
            }
          }}
        />
      ))}
    </div>
  );
}
