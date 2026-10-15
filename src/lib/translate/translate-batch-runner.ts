import { addUsage, estimateUsageFromChars } from "./translate-cost";
import { splitHalves } from "./translate-batching";
import { TranslationShapeError, TranslatorUnavailableError, type TranslateContext, type TranslateItem, type TranslateUsage, type Translator } from "./translator-interface";

/**
 * One batch, resiliently: a malformed answer (TranslationShapeError) → retry once → split into halves → … → per cue →
 * the English text is kept for a cue the model refuses to answer. Transport failures (TranslatorUnavailableError):
 * 429 / 5xx back off 1 s → 3 s → 8 s (3 more tries, small jitter — 4 workers must not burst-retry), a network error
 * (status 0) is retried once immediately, anything else (401, 402, 404 …) fails at once. Splitting cannot fix an
 * outage, so a transport failure propagates and the job fails fast (kie-down).
 */
export type BatchOutcome = { lines: string[]; usage: TranslateUsage; keptEnglish: number; calls: number };
export type RunnerOptions = { /** delays before each retry of a 429 / 5xx answer (tests pass zeros) */ backoffMs?: number[] };
export const DEFAULT_BACKOFF_MS = [1000, 3000, 8000];
const JITTER_MS = 500;
type Stats = { usage: TranslateUsage; calls: number; kept: number };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isRateOrServerError = (err: unknown) => err instanceof TranslatorUnavailableError && (err.status === 429 || err.status >= 500);
const isNetworkError = (err: unknown) => err instanceof TranslatorUnavailableError && err.status === 0;

async function attempt(tr: Translator, items: TranslateItem[], ctx: TranslateContext, stats: Stats): Promise<Map<number, string>> {
  const r = await tr.translate(items, ctx);
  stats.calls++;
  stats.usage = addUsage(stats.usage, r.usage ?? estimateUsageFromChars(items.reduce((n, x) => n + x.t.length, 0), [...r.lines.values()].reduce((n, t) => n + t.length, 0)));
  return r.lines;
}

/** Transport-level resilience around one model call; shape errors pass through to the caller. */
async function attemptWithTransportRetries(tr: Translator, items: TranslateItem[], ctx: TranslateContext, stats: Stats, backoff: number[]): Promise<Map<number, string>> {
  let slow = 0;
  let network = 0;
  for (;;) {
    try {
      return await attempt(tr, items, ctx, stats);
    } catch (err) {
      if (isRateOrServerError(err) && slow < backoff.length) {
        const delay = backoff[slow++];
        await sleep(delay > 0 ? delay + Math.random() * JITTER_MS : 0);
        continue;
      }
      if (isNetworkError(err) && network < 1) {
        network++;
        continue;
      }
      throw err;
    }
  }
}

async function translateOrSplit(tr: Translator, items: TranslateItem[], ctx: TranslateContext, stats: Stats, shapeRetries: number, backoff: number[]): Promise<Map<number, string>> {
  for (let n = 0; n <= shapeRetries; n++) {
    try {
      return await attemptWithTransportRetries(tr, items, ctx, stats, backoff);
    } catch (err) {
      if (!(err instanceof TranslationShapeError)) throw err;
    }
  }
  if (items.length === 1) {
    stats.kept++;
    return new Map([[items[0].i, items[0].t]]);
  }
  const [a, b] = splitHalves(items);
  const left = await translateOrSplit(tr, a, ctx, stats, 0, backoff);
  const right = await translateOrSplit(tr, b, { ...ctx, previous: [...ctx.previous, ...a.map((x) => ({ i: x.i, t: left.get(x.i) ?? x.t }))].slice(-4) }, stats, 0, backoff);
  return new Map([...left, ...right]);
}

export async function translateBatchResilient(tr: Translator, items: TranslateItem[], ctx: TranslateContext, opts: RunnerOptions = {}): Promise<BatchOutcome> {
  const stats: Stats = { usage: { inputTokens: 0, outputTokens: 0 }, calls: 0, kept: 0 };
  const map = await translateOrSplit(tr, items, ctx, stats, 1, opts.backoffMs ?? DEFAULT_BACKOFF_MS);
  return { lines: items.map((x) => map.get(x.i) ?? x.t), usage: stats.usage, keptEnglish: stats.kept, calls: stats.calls };
}
