/**
 * How long a community search result stays valid (in-memory stamp per title): a full clean answer is good for 24 h;
 * when a provider failed / timed out or the title has no IMDb id (TMDB down), only 10 min — a hiccup must never
 * turn into a day of "Không có phụ đề" (and a paid AI translation while a free vi exists).
 */
export const SEARCH_TTL_MS = 24 * 3_600_000;
export const SEARCH_RETRY_TTL_MS = 10 * 60_000;

export const searchTtlMs = (input: { failed: boolean; imdbId: string | null }): number => (input.failed || !input.imdbId ? SEARCH_RETRY_TTL_MS : SEARCH_TTL_MS);
