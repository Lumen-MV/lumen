import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { fakeTranslator } from "@/lib/translate/fake-translator";
import { assembleCues, contextFor, makeBatches, percentOf, splitHalves } from "@/lib/translate/translate-batching";
import { DEFAULT_BACKOFF_MS, translateBatchResilient } from "@/lib/translate/translate-batch-runner";
import { buildUserPayload, parseTranslation, SYSTEM_PROMPT } from "@/lib/translate/translate-prompt";
import { TranslationShapeError, TranslatorUnavailableError, type TranslateItem, type Translator } from "@/lib/translate/translator-interface";

/** AI batching (50 + 4 context), prompt payload / validation, retry → split → per-cue → EN fallback, Kie client against a mocked fetch. */
process.env.SESSION_SECRET = "test-secret-test-secret-test-secret-1234";
process.env.ADMIN_USERNAME = "owner";
process.env.ADMIN_PASSWORD = "admin-pass-123";
process.env.KIE_API_KEY = "kie-SECRET-key";
process.env.KIE_BASE_URL = "https://kie.example";
process.env.KIE_MODEL = "deepseek-v4-1-flash";

const cues = Array.from({ length: 120 }, (_, i) => ({ start: i * 1000, end: i * 1000 + 900, text: `line ${i}` }));

describe("batching", () => {
  it("50-cue batches with index + text only; context = last 4 cues of the previous batch (translated when done)", () => {
    const batches = makeBatches(cues);
    expect(batches.map((b) => b.length)).toEqual([50, 50, 20]);
    expect(batches[1][0]).toEqual({ i: 50, t: "line 50" });
    expect(contextFor(batches, 0, {})).toEqual([]);
    expect(contextFor(batches, 1, {}).map((c) => c.t)).toEqual(["line 46", "line 47", "line 48", "line 49"]);
    const done = { 0: batches[0].map((x) => `vi ${x.i}`) };
    expect(contextFor(batches, 1, done).map((c) => c.t)).toEqual(["vi 46", "vi 47", "vi 48", "vi 49"]);
    expect(splitHalves(batches[2]).map((h) => h.length)).toEqual([10, 10]);
    expect(percentOf(1, 3)).toBe(33);
  });
  it("assembleCues re-attaches timings and keeps English for a missing batch", () => {
    const batches = makeBatches(cues);
    const out = assembleCues(cues, batches, { 0: batches[0].map(() => "vi") });
    expect(out[0]).toEqual({ start: 0, end: 900, text: "vi" });
    expect(out[60]).toEqual({ start: 60_000, end: 60_900, text: "line 60" });
  });
});

describe("prompt + validation", () => {
  const items: TranslateItem[] = [{ i: 3, t: "Hi" }, { i: 4, t: "Bye" }];
  it("payload carries file name + context + items, never timestamps", () => {
    const p = JSON.parse(buildUserPayload(items, { previous: [{ i: 2, t: "Chào" }], fileName: "Movie.2021.1080p.mkv" }));
    expect(p).toEqual({ file: "Movie.2021.1080p.mkv", context: [{ i: 2, t: "Chào" }], items: [{ i: 3, t: "Hi" }, { i: 4, t: "Bye" }] });
    expect(SYSTEM_PROMPT).toContain('{"items":[{"i":số,"t":"bản dịch"}]}');
  });
  it("parseTranslation: fenced JSON ok, extra indices dropped, missing / empty / non-JSON → TranslationShapeError, non-numeric `i` never coerced", () => {
    expect([...parseTranslation('```json\n{"items":[{"i":3,"t":"Chào"},{"i":4,"t":"Tạm biệt"},{"i":9,"t":"x"}]}\n```', items)]).toEqual([[3, "Chào"], [4, "Tạm biệt"]]);
    // `null` / "" / true would coerce to 0 / 1 with Number(); "3" must not pass either — only real integers are indices
    expect(() => parseTranslation('{"items":[{"i":null,"t":"a"},{"i":"","t":"b"},{"i":true,"t":"c"},{"i":"3","t":"d"},{"i":4,"t":"Tạm biệt"}]}', items)).toThrow(/missing 1\/2 cues \(3\)/);
    expect(() => parseTranslation('{"items":[{"i":3.5,"t":"a"},{"i":4,"t":"b"}]}', items)).toThrow(TranslationShapeError);
    expect(() => parseTranslation('{"items":[{"i":3,"t":"Chào"}]}', items)).toThrow(TranslationShapeError);
    expect(() => parseTranslation('{"items":[{"i":3,"t":""},{"i":4,"t":"x"}]}', items)).toThrow(/missing 1\/2/);
    expect(() => parseTranslation("nope", items)).toThrow(TranslationShapeError);
  });
});

describe("translateBatchResilient", () => {
  const items: TranslateItem[] = Array.from({ length: 8 }, (_, i) => ({ i, t: `en ${i}` }));
  const ctx = { previous: [], fileName: "x.mkv" };
  it("happy path: one call", async () => {
    const r = await translateBatchResilient(fakeTranslator({ delayMs: 0 }), items, ctx);
    expect(r.lines).toEqual(items.map((x) => `[VI] ${x.t}`));
    expect(r.calls).toBe(1);
    expect(r.keptEnglish).toBe(0);
    expect(r.usage).toEqual({ inputTokens: 160, outputTokens: 160 });
  });
  it("shape errors: retry once → halves → per cue → English kept for the cue the model never answers", async () => {
    const calls: number[] = [];
    const tr: Translator = {
      name: "fake",
      async translate(batch) {
        calls.push(batch.length);
        if (batch.some((x) => x.i === 5) && batch.length > 1) throw new TranslationShapeError("missing 5");
        if (batch.length === 1 && batch[0].i === 5) throw new TranslationShapeError("still missing");
        return { lines: new Map(batch.map((x) => [x.i, `vi ${x.i}`])), usage: null };
      },
    };
    const r = await translateBatchResilient(tr, items, ctx);
    expect(r.lines).toEqual(["vi 0", "vi 1", "vi 2", "vi 3", "vi 4", "en 5", "vi 6", "vi 7"]);
    expect(r.keptEnglish).toBe(1);
    expect(calls.slice(0, 2)).toEqual([8, 8]); // retry once at full size
    expect(Math.max(...calls.slice(2))).toBeLessThanOrEqual(4);
  });
  it("transport: 429 / 5xx back off through the delay list (3 retries) then propagate; network error retried once; 401 fails at once — never a splitting storm", async () => {
    const counting = (status: number) => {
      let n = 0;
      const tr: Translator = { name: "kie", async translate() { n++; throw new TranslatorUnavailableError(`Kie ${status}`, status); } };
      return { tr, calls: () => n };
    };
    const a = counting(503);
    await expect(translateBatchResilient(a.tr, items, ctx, { backoffMs: [0, 0, 0] })).rejects.toThrow(/503/);
    expect(a.calls()).toBe(4);
    const b = counting(0);
    await expect(translateBatchResilient(b.tr, items, ctx, { backoffMs: [0, 0, 0] })).rejects.toThrow(/Kie 0/);
    expect(b.calls()).toBe(2);
    const c = counting(401);
    await expect(translateBatchResilient(c.tr, items, ctx, { backoffMs: [0, 0, 0] })).rejects.toThrow(/401/);
    expect(c.calls()).toBe(1);
    // 429 twice, then success → 3 calls, full result
    let n = 0;
    const flaky: Translator = { name: "kie", async translate(batch) { if (++n < 3) throw new TranslatorUnavailableError("Kie 429", 429); return { lines: new Map(batch.map((x) => [x.i, `vi ${x.i}`])), usage: null }; } };
    const t0 = Date.now();
    const r = await translateBatchResilient(flaky, items, ctx, { backoffMs: [20, 20, 20] });
    expect(r.lines[7]).toBe("vi 7");
    expect(r.calls).toBe(1); // only the successful call counts toward usage / calls
    expect(n).toBe(3);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(35); // two waits of ≥ 20 ms
    expect(DEFAULT_BACKOFF_MS).toEqual([1000, 3000, 8000]);
  });
});

describe("kieTranslator (mocked fetch)", () => {
  type Mod = typeof import("@/lib/translate/kie-deepseek-translator");
  let m: Mod;
  const fetchMock = vi.fn<typeof fetch>();
  beforeAll(async () => {
    m = await import("@/lib/translate/kie-deepseek-translator");
    m.setKieFetch(fetchMock);
  });
  afterEach(() => fetchMock.mockReset());
  const items: TranslateItem[] = [{ i: 0, t: "Hello" }, { i: 1, t: "[music]" }];
  it("posts the Responses payload (model, json_object, reasoning none, Bearer) and parses output_text + usage", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ output_text: '{"items":[{"i":0,"t":"Xin chào"},{"i":1,"t":"[nhạc]"}]}', usage: { input_tokens: 120, output_tokens: 30 } }), { status: 200 }));
    const r = await m.kieTranslator().translate(items, { previous: [], fileName: "f.mkv" });
    expect([...r.lines]).toEqual([[0, "Xin chào"], [1, "[nhạc]"]]);
    expect(r.usage).toEqual({ inputTokens: 120, outputTokens: 30 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://kie.example/openai/v1/responses");
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({ model: "deepseek-v4-1-flash", stream: false, reasoning: { effort: "none" }, text: { format: { type: "json_object" } } });
    expect(body.input[0]).toEqual({ role: "system", content: SYSTEM_PROMPT });
    expect(JSON.parse(body.input[1].content).items).toEqual(items);
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer kie-SECRET-key");
  });
  it("output[] content form, non-200 envelope code, HTTP 503 and bad shape map to the right errors", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ output: [{ content: [{ type: "output_text", text: '{"items":[{"i":0,"t":"A"},{"i":1,"t":"B"}]}' }] }] }), { status: 200 }));
    expect([...(await m.kieTranslator().translate(items, { previous: [], fileName: "" })).lines.values()]).toEqual(["A", "B"]);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ code: 402, msg: "insufficient credits" }), { status: 200 }));
    await expect(m.kieTranslator().translate(items, { previous: [], fileName: "" })).rejects.toThrow(TranslatorUnavailableError);
    fetchMock.mockResolvedValueOnce(new Response("busy", { status: 503 }));
    await expect(m.kieTranslator().translate(items, { previous: [], fileName: "" })).rejects.toThrow(/Kie 503/);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ output_text: '{"items":[{"i":0,"t":"A"}]}' }), { status: 200 }));
    await expect(m.kieTranslator().translate(items, { previous: [], fileName: "" })).rejects.toThrow(TranslationShapeError);
    expect(m.responsesText({})).toBe("");
  });
});
