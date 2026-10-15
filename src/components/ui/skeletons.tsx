"use client";
import { useEffect, useState } from "react";
import { cx } from "@/lib/format/class-names";

/** Skeletons share the mockup's `.sk .skimg .skline .skhero` classes (shimmer keyframes `sh` in states.css). */
const range = (n: number) => Array.from({ length: n }, (_, i) => i);

export function RowSkeleton({ n = 7, wide = false }: { n?: number; wide?: boolean }) {
  return (
    <div className="row">
      {range(n).map((i) => (
        <div key={i} className={cx("card", wide && "wide", "sk")}>
          <div className="skimg" />
          <div className="skline" />
        </div>
      ))}
    </div>
  );
}

export function HeroSkeleton() {
  return (
    <div className="skhero" style={{ position: "relative" }}>
      <div className="t">
        <div style={{ width: 420, height: 54 }} />
        <div style={{ width: 300, height: 16 }} />
        <div style={{ width: 520, height: 44 }} />
      </div>
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div className="skhero" style={{ position: "relative", height: 600, marginTop: 0 }}>
      <div className="t" style={{ bottom: 40 }}>
        <div style={{ width: 460, height: 54 }} />
        <div style={{ width: 340, height: 42 }} />
        <div style={{ width: 620, height: 16 }} />
        <div style={{ width: 580, height: 16 }} />
      </div>
    </div>
  );
}

export function GridSkeleton({ n = 14 }: { n?: number }) {
  return (
    <div className="grid">
      {range(n).map((i) => (
        <div key={i} className="card sk">
          <div className="skimg" />
          <div className="skline" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <table>
      <tbody>
        {range(rows).map((r) => (
          <tr key={r} className="sk">
            {range(cols).map((c) => (
              <td key={c}>
                <div className="skline" style={{ marginTop: 0 }} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Keeps a skeleton on screen ≥ `minMs` so fast loads don't flash (mockup spec: 250ms). */
export function useMinDisplay(loading: boolean, minMs = 250): boolean {
  const [show, setShow] = useState(loading);
  useEffect(() => {
    if (loading) {
      setShow(true);
      return;
    }
    const t = setTimeout(() => setShow(false), minMs);
    return () => clearTimeout(t);
  }, [loading, minMs]);
  return show;
}
