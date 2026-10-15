import type { TranslateUsage } from "./translator-interface";

/**
 * Token usage → VND (25,500 ₫/USD). Kie / DeepSeek flash: ESTIMATE from the research B4 list price ($0.15 in / $0.60
 * out per M tokens — not yet verified against a Kie invoice; the copy says "khoảng 500đ") → a 2 h movie (≈ 25k + 25k
 * tokens) ≈ $0.019 ≈ 480 ₫. Claude Haiku 4.5: published list price $1 in / $5 out per M tokens. Missing usage →
 * estimated from characters.
 */
export const VND_PER_USD = 25_500;
const PRICES_USD_PER_M: Record<string, { input: number; output: number }> = { kie: { input: 0.15, output: 0.6 }, deepseek: { input: 0.15, output: 0.6 }, claude: { input: 1, output: 5 }, fake: { input: 0.15, output: 0.6 } };
const CHARS_PER_TOKEN = 3;

export function costVnd(translator: string, usage: TranslateUsage): number {
  const p = PRICES_USD_PER_M[translator] ?? PRICES_USD_PER_M.kie;
  const usd = (usage.inputTokens * p.input + usage.outputTokens * p.output) / 1_000_000;
  return Math.ceil(usd * VND_PER_USD);
}

/** Fallback when a backend reports no usage: both directions ≈ the text length (prompt overhead included). */
export function estimateUsageFromChars(inputChars: number, outputChars: number): TranslateUsage {
  return { inputTokens: Math.ceil(inputChars / CHARS_PER_TOKEN) + 200, outputTokens: Math.ceil(outputChars / CHARS_PER_TOKEN) };
}

export const addUsage = (a: TranslateUsage, b: TranslateUsage): TranslateUsage => ({ inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens });

/** `settings.ai_month_cost_vnd` resets when the month changes (`ai_month_cost_month` = "2026-10"). */
export const monthKey = (d = new Date()): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
