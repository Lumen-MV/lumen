"use client";
import { useEffect, useState } from "react";
import type { TitleMetaResponse } from "@/lib/tmdb/catalog-queries-detail";

/**
 * Hover-panel meta (runtime / "N mùa", Vietnamese genres, saved / liked) from /api/catalog/meta while `active`.
 * Starts as soon as the card is armed (before the 400 ms panel delay) so the panel usually opens with data;
 * deactivating aborts and forgets the answer, so a re-hover never shows a stale saved / liked snapshot.
 */
export function useTitleMeta(mediaKey: string, active: boolean) {
  const [meta, setMeta] = useState<TitleMetaResponse | null>(null);
  useEffect(() => {
    if (!active) {
      setMeta(null);
      return;
    }
    const ctrl = new AbortController();
    fetch(`/api/catalog/meta?key=${encodeURIComponent(mediaKey)}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<TitleMetaResponse>) : null))
      .then((m) => m && setMeta(m))
      .catch((err: unknown) => {
        if ((err as Error | null)?.name !== "AbortError") console.warn("[hover] meta failed", err);
      });
    return () => ctrl.abort();
  }, [mediaKey, active]);
  return meta;
}
