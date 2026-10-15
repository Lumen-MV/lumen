/**
 * vi-VN overview is often empty on TMDB. `resolveOverview` keeps the Vietnamese text when present,
 * otherwise asks for the en-US copy (one extra cached call) and flags the language for the "EN" pill.
 * Pure: the en-US loader is injected so it is unit-testable.
 */
export type OverviewLang = "vi" | "en";
export type ResolvedOverview = { overview: string; overviewLang: OverviewLang };

export async function resolveOverview(viOverview: string | null | undefined, loadEnglish: () => Promise<string | null | undefined>): Promise<ResolvedOverview> {
  const vi = (viOverview ?? "").trim();
  if (vi) return { overview: vi, overviewLang: "vi" };
  try {
    const en = ((await loadEnglish()) ?? "").trim();
    return { overview: en, overviewLang: "en" };
  } catch (err) {
    console.warn("[tmdb] en-US overview fallback failed", err instanceof Error ? err.message : err);
    return { overview: "", overviewLang: "en" };
  }
}
