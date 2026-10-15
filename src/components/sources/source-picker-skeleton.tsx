"use client";
import type { CSSProperties } from "react";

const sk = (w: number | string, h: number, bg = "#2a2a2a", extra?: CSSProperties) => <div style={{ width: w, height: h, background: bg, borderRadius: 3, ...extra }} />;

/** `skRows` from screen-detail.js: 3 `.src` rows of grey blocks (48×16 · 60%×14 + 90%×10 · 70×30). */
export function SourcePickerSkeleton() {
  return (
    <div data-picker-loading>
      {[0, 1, 2].map((i) => (
        <div key={i} className="src">
          <div className="q">{sk(48, 16)}</div>
          <div className="d">
            {sk("60%", 14, "#2a2a2a", { marginBottom: 6 })}
            {sk("90%", 10, "#222")}
          </div>
          <div className="act">{sk(70, 30, "#2a2a2a", { borderRadius: 4 })}</div>
        </div>
      ))}
    </div>
  );
}
