"use client";
import { useCallback, useEffect, useState } from "react";
import { MAX_QUERY, RECENT_SEARCHES_KEY, RECENT_SEARCHES_MAX } from "@/lib/tmdb/search-query-rules";

/** Recent queries in localStorage (`lumen.recentSearches`, last 5, most recent first). No server table (KISS). */
const clean = (q: string) => q.trim().replace(/\s+/g, " ").slice(0, MAX_QUERY);

/** localStorage is user-editable: keep only non-empty strings, bounded in length and count, de-duplicated (case-insensitive). */
function sanitize(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const t = clean(v);
    if (t && !out.some((p) => p.toLowerCase() === t.toLowerCase())) out.push(t);
    if (out.length >= RECENT_SEARCHES_MAX) break;
  }
  return out;
}

function load(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    return sanitize(raw ? (JSON.parse(raw) as unknown) : []);
  } catch {
    return [];
  }
}

function save(list: string[]) {
  try {
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(list));
  } catch (err) {
    console.warn("[recent-searches] cannot persist", err);
  }
}

/** `active` = overlay open → re-read storage on every open (the overlay component stays mounted across opens). */
export function useRecentSearches(active = true) {
  const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => {
    if (active) setRecent(load());
  }, [active]);

  const add = useCallback((q: string) => {
    const t = clean(q);
    if (!t) return;
    setRecent((prev) => {
      const next = sanitize([t, ...prev]);
      save(next);
      return next;
    });
  }, []);

  const remove = useCallback((q: string) => {
    setRecent((prev) => {
      const next = prev.filter((p) => p !== q);
      save(next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    save([]);
    setRecent([]);
  }, []);

  return { recent, add, remove, clear };
}
