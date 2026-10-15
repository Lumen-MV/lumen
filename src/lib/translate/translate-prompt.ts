import { TranslationShapeError, type TranslateContext, type TranslateItem } from "./translator-interface";

/**
 * Prompt shared by every backend (identical system text → provider prompt caching). The user payload carries the
 * release file name (genre / tone hint), the previous cues as read-only context and the batch as index + text only —
 * never timestamps, never TMDB overview text (ToS).
 */
export const PROMPT_VERSION = 2;
export const SYSTEM_PROMPT = `Bạn dịch phụ đề phim từ tiếng Anh sang tiếng Việt.
Quy tắc: dịch từng dòng theo số thứ tự "i", giữ nguyên số lượng và thứ tự, không gộp hay tách dòng;
văn nói tự nhiên, ngắn gọn để đọc kịp trên màn hình; giữ xuống dòng (\\n) và các thẻ <i> <b> nếu có;
giữ tên riêng; chú thích âm thanh như [music] dịch thành [nhạc];
chọn đại từ (tôi/anh/em/cậu/tớ/ông/bà) phù hợp quan hệ nhân vật và giữ nhất quán với phần "context" (các dòng đã dịch ngay trước đó);
"file" là tên file phát hành, chỉ dùng để đoán thể loại và giọng điệu.
Trả về đúng JSON {"items":[{"i":số,"t":"bản dịch"}]} cho mọi dòng trong "items", không giải thích gì thêm.`;

export function buildUserPayload(items: TranslateItem[], ctx: TranslateContext): string {
  return JSON.stringify({ file: ctx.fileName, context: ctx.previous.map((p) => ({ i: p.i, t: p.t })), items: items.map((x) => ({ i: x.i, t: x.t })) });
}

/** Model text → index → translation; throws TranslationShapeError when the set of indices is not exactly the batch. */
export function parseTranslation(text: string, expected: TranslateItem[]): Map<number, string> {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new TranslationShapeError("not JSON");
  }
  const items = Array.isArray(parsed) ? parsed : Array.isArray((parsed as { items?: unknown })?.items) ? (parsed as { items: unknown[] }).items : null;
  if (!items) throw new TranslationShapeError("no items array");
  const out = new Map<number, string>();
  for (const raw of items) {
    // strict: `i` must be a real integer (null / "" / true would coerce to 0 / 1 and overwrite a genuine cue)
    const it = raw as { i?: unknown; t?: unknown };
    if (typeof it.i !== "number" || !Number.isInteger(it.i) || typeof it.t !== "string") continue;
    out.set(it.i, it.t.trim());
  }
  const missing = expected.filter((e) => !out.has(e.i) || out.get(e.i) === "");
  if (missing.length) throw new TranslationShapeError(`missing ${missing.length}/${expected.length} cues (${missing.slice(0, 5).map((m) => m.i).join(",")})`);
  const wanted = new Set(expected.map((e) => e.i));
  for (const k of out.keys()) if (!wanted.has(k)) out.delete(k);
  return out;
}
