/** Shared by the search overlay (client), /search page and /api/catalog/search: ≥ 2 chars, ≤ 80 (input maxLength, server slice, recents), 300 ms debounce. */
export const MIN_QUERY = 2;
export const MAX_QUERY = 80;
export const SEARCH_DEBOUNCE_MS = 300;
export const OVERLAY_RESULT_LIMIT = 8;
export const RECENT_SEARCHES_KEY = "lumen.recentSearches";
export const RECENT_SEARCHES_MAX = 5;
