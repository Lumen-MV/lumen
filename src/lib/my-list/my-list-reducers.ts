import type { CardItem } from "@/lib/tmdb/catalog-types";

/**
 * Pure state of /my-list (spec phase-06): filter chips, sort menu, grid/list view, bulk selection, remove + undo.
 * The page component dispatches here and performs the network calls around it.
 */
export type MyListItem = CardItem & { addedAt: string };
export type MyListFilter = "all" | "movie" | "tv" | "cached";
export type MyListSort = "added" | "name" | "year";
export type MyListView = "grid" | "list";

export type MyListState = {
  items: MyListItem[];
  filter: MyListFilter;
  sort: MyListSort;
  view: MyListView;
  bulk: boolean;
  selected: string[];
};

export type MyListAction =
  | { type: "filter"; filter: MyListFilter }
  | { type: "sort"; sort: MyListSort }
  | { type: "view"; view: MyListView }
  | { type: "bulk"; on: boolean }
  | { type: "toggle-select"; mediaKey: string }
  | { type: "remove"; mediaKeys: string[] }
  | { type: "restore"; item: MyListItem; index: number };

export const initialMyListState = (items: MyListItem[]): MyListState => ({ items, filter: "all", sort: "added", view: "grid", bulk: false, selected: [] });

export function myListReducer(s: MyListState, a: MyListAction): MyListState {
  switch (a.type) {
    case "filter":
      return { ...s, filter: a.filter };
    case "sort":
      return { ...s, sort: a.sort };
    case "view":
      return { ...s, view: a.view };
    case "bulk":
      return { ...s, bulk: a.on, selected: a.on ? s.selected : [] };
    case "toggle-select":
      return { ...s, selected: s.selected.includes(a.mediaKey) ? s.selected.filter((k) => k !== a.mediaKey) : [...s.selected, a.mediaKey] };
    case "remove": {
      const gone = new Set(a.mediaKeys);
      return { ...s, items: s.items.filter((i) => !gone.has(i.mediaKey)), selected: s.selected.filter((k) => !gone.has(k)) };
    }
    case "restore": {
      if (s.items.some((i) => i.mediaKey === a.item.mediaKey)) return s;
      const items = [...s.items];
      items.splice(Math.min(a.index, items.length), 0, a.item);
      return { ...s, items };
    }
  }
}

export function matchesFilter(item: MyListItem, filter: MyListFilter): boolean {
  if (filter === "all") return true;
  if (filter === "cached") return item.cacheState === "cached";
  return item.type === filter;
}

/** Newest added first · name A→Z (locale vi) · year desc, then name. */
export function sortItems(items: MyListItem[], sort: MyListSort): MyListItem[] {
  const list = [...items];
  if (sort === "added") return list.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  if (sort === "name") return list.sort((a, b) => a.title.localeCompare(b.title, "vi"));
  return list.sort((a, b) => Number(b.year) - Number(a.year) || a.title.localeCompare(b.title, "vi"));
}

export const visibleItems = (s: MyListState): MyListItem[] => sortItems(s.items.filter((i) => matchesFilter(i, s.filter)), s.sort);

/** "N ngày trước" input: whole days since `addedAt` (0 for today). */
export const daysSince = (iso: string, now = Date.now()): number => Math.max(0, Math.floor((now - new Date(iso).getTime()) / 86_400_000));
