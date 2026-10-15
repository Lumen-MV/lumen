/**
 * Splits a title into plain / matched segments for the overlay's `<mark>` highlight.
 * Matching is case- and diacritic-insensitive ("nguoi nhen" marks "Người Nhện"); no match → one plain segment.
 */
export type HighlightSegment = { text: string; match: boolean };

export function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");
}

export function highlightMatch(title: string, query: string): HighlightSegment[] {
  const q = stripDiacritics(query.trim()).toLowerCase();
  if (!q || !title) return [{ text: title, match: false }];
  // NFD + strip keeps one output char per input base char except đ→d (same length), so indices line up
  const folded = stripDiacritics(title).toLowerCase();
  if (folded.length !== title.length) return [{ text: title, match: false }];
  const start = folded.indexOf(q);
  if (start < 0) return [{ text: title, match: false }];
  const end = start + q.length;
  const out: HighlightSegment[] = [];
  if (start > 0) out.push({ text: title.slice(0, start), match: false });
  out.push({ text: title.slice(start, end), match: true });
  if (end < title.length) out.push({ text: title.slice(end), match: false });
  return out;
}
