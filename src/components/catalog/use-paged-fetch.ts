"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CardItem, PageResult } from "@/lib/tmdb/catalog-types";

export type PagedState = { items: CardItem[]; page: number; total: number | null; done: boolean; status: "loading" | "ready" | "loading-more" | "error" };
const START: PagedState = { items: [], page: 0, total: null, done: false, status: "loading" };

/**
 * Infinite-scroll pagination over any `{items, page, totalResults, done}` endpoint (browse discover, search).
 * `urlForPage` identity change = new query → state resets and page 1 reloads. Stale responses are ignored.
 */
export function usePagedFetch(urlForPage: (page: number) => string, initial?: PageResult) {
  const [state, setState] = useState<PagedState>(initial ? { items: initial.items, page: initial.page, total: initial.totalResults, done: initial.done, status: "ready" } : START);
  const seq = useRef(0);
  const busy = useRef(false);

  const load = useCallback(
    async (page: number, reset: boolean) => {
      const my = ++seq.current;
      busy.current = true;
      setState((s) => (reset ? { ...START, status: "loading" } : { ...s, status: "loading-more" }));
      try {
        const res = await fetch(urlForPage(page));
        if (!res.ok) throw new Error(`catalog ${res.status}`);
        const data = (await res.json()) as PageResult;
        if (my !== seq.current) return;
        setState((s) => {
          // popularity sorts shift between pages → the same title can come back; keep React keys unique
          const seen = new Set(reset ? [] : s.items.map((it) => it.mediaKey));
          const fresh = data.items.filter((it) => !seen.has(it.mediaKey));
          return { items: reset ? fresh : [...s.items, ...fresh], page: data.page, total: data.totalResults, done: data.done, status: "ready" };
        });
      } catch (err) {
        if (my !== seq.current) return;
        // handled (ErrorBox + Thử lại) → warn, so the page keeps 0 console errors under tmdb-down
        console.warn("[paged-fetch]", err);
        setState((s) => ({ ...s, status: "error" }));
      } finally {
        if (my === seq.current) busy.current = false;
      }
    },
    [urlForPage],
  );

  // new query → reload page 1 (unless the server already rendered page 1 for this exact query)
  const initialRef = useRef(initial);
  useEffect(() => {
    if (initialRef.current) {
      initialRef.current = undefined;
      return;
    }
    void load(1, true);
  }, [load]);

  const loadMore = useCallback(() => {
    if (busy.current || state.done || state.status !== "ready") return;
    void load(state.page + 1, false);
  }, [load, state.done, state.page, state.status]);

  const retry = useCallback(() => void load(state.page === 0 ? 1 : state.page + (state.items.length ? 1 : 0), state.items.length === 0), [load, state.items.length, state.page]);

  return { ...state, loadMore, retry };
}
