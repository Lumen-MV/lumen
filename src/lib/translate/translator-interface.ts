/** Backend-agnostic subtitle translation contract (cue index + text in, index → Vietnamese out). */
export type TranslateItem = { i: number; t: string };
export type TranslateContext = { /** last translated cues of the previous batch (or their English when not done yet) */ previous: TranslateItem[]; /** release file name — the only title context allowed in prompts (no TMDB text) */ fileName: string };
export type TranslateUsage = { inputTokens: number; outputTokens: number };
export type TranslateResult = { lines: Map<number, string>; usage: TranslateUsage | null };

export type Translator = { name: "kie" | "deepseek" | "claude" | "fake"; translate(items: TranslateItem[], ctx: TranslateContext): Promise<TranslateResult> };

/** The model answered but not in the agreed shape (bad JSON, missing / extra indices) → worth retrying / splitting. */
export class TranslationShapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TranslationShapeError";
  }
}
/** Transport / provider failure (timeout, 5xx, auth) → retry once, then the job fails. */
export class TranslatorUnavailableError extends Error {
  constructor(message: string, readonly status = 0) {
    super(message);
    this.name = "TranslatorUnavailableError";
  }
}
