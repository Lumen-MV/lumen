/**
 * Pure HTTP Range helpers shared by the stream proxy and the dev sample route (RFC 9110 §14): parses a single
 * `bytes=` range against a known size and builds the 206 / 416 headers. Multi-range requests are answered as a whole
 * body (browsers never send them for <video>).
 */
export type ByteRange = { start: number; end: number };

/** `bytes=0-499` / `bytes=500-` / `bytes=-500` → inclusive range inside `size`; null = no/invalid header (→ 200); "unsatisfiable" → 416. */
export function parseRange(header: string | null | undefined, size: number): ByteRange | null | "unsatisfiable" {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) return null;
  if (size <= 0) return "unsatisfiable";
  let start: number, end: number;
  if (m[1] === "") {
    // suffix range: last N bytes
    const n = Number(m[2]);
    if (n === 0) return "unsatisfiable";
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= size || start > end) return "unsatisfiable";
  return { start, end };
}

export function contentRange(r: ByteRange, size: number): string {
  return `bytes ${r.start}-${r.end}/${size}`;
}

export const unsatisfiableRange = (size: number): string => `bytes */${size}`;
