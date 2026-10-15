"use client";
import { Fragment } from "react";
import { copy } from "@/lib/copy-vi";
import type { SubSize } from "@/lib/subtitles/subtitle-types";

type Props = { size: SubSize; onChange: (s: SubSize) => void };

/** `.ctrl` "Cỡ chữ  S · M · L" — the current size underlined (mockup `<u>`). */
export function SubtitleSizeControl({ size, onChange }: Props) {
  const s = copy.subs;
  return (
    <div className="ctrl" data-ctrl="size" role="radiogroup" aria-label={s.size}>
      <span>{s.size}</span>
      <b>
        {s.sizes.map((label, i) => (
          <Fragment key={label}>
            {i > 0 && s.sizeSep}
            <button type="button" className="step" role="radio" aria-checked={label === size} data-size={label} onClick={() => onChange(label as SubSize)}>
              {label === size ? <u>{label}</u> : label}
            </button>
          </Fragment>
        ))}
      </b>
    </div>
  );
}
