import { SAMPLE_TRANSLATIONS } from "@/lib/subtitles/subtitle-sample-cues";
import { TranslatorUnavailableError, type Translator } from "./translator-interface";

/**
 * Dev / test backend (scenario `subs-sim`, `kie-down`, unit tests): answers the mockup dictionary or `[VI] <text>` after
 * a short delay so progress is observable; `failAlways` turns every call into an outage (the job runner simulates
 * kie-down's "fails at 40 %" itself so the cut is deterministic regardless of batch count / concurrency).
 */
export type FakeOptions = { delayMs?: number; failAlways?: boolean; usagePerCue?: number };
export const simulatedOutage = () => new TranslatorUnavailableError("Kie unreachable: simulated outage (kie-down)", 503);

export function fakeTranslator(opts: FakeOptions = {}): Translator {
  const delay = opts.delayMs ?? 1000;
  return {
    name: "fake",
    async translate(items) {
      if (delay > 0) await new Promise((r) => setTimeout(r, delay));
      if (opts.failAlways) throw simulatedOutage();
      const lines = new Map(items.map((x) => [x.i, SAMPLE_TRANSLATIONS[x.t] ?? `[VI] ${x.t}`]));
      const per = opts.usagePerCue ?? 20;
      return { lines, usage: { inputTokens: items.length * per, outputTokens: items.length * per } };
    },
  };
}
