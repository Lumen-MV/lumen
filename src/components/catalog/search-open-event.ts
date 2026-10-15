/**
 * Window event that opens the header's search overlay from outside the header (mobile tab bar "Tìm kiếm" → full-screen sheet).
 * Same path as the global `/` shortcut, so there is one overlay instance and no shared React state across the layout.
 */
export const OPEN_SEARCH_EVENT = "lumen:open-search";

export function requestOpenSearch(): void {
  window.dispatchEvent(new Event(OPEN_SEARCH_EVENT));
}
