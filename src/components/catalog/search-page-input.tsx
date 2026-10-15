"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { copy } from "@/lib/copy-vi";
import { MAX_QUERY, MIN_QUERY } from "@/lib/tmdb/search-query-rules";
import { useRecentSearches } from "./use-recent-searches";

/**
 * `.msearch` — shown only ≤ 700 px (CSS): phones hide the header 🔍, so /search carries its own input pre-filled
 * with the current query. Submit → /search?q= (and the recent-searches list), same rules as the overlay.
 */
export function SearchPageInput({ q }: { q: string }) {
  const router = useRouter();
  const [value, setValue] = useState(q);
  const recent = useRecentSearches();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = value.trim();
    if (t.length < MIN_QUERY) return;
    recent.add(t);
    router.push(`/search?q=${encodeURIComponent(t)}`);
  };
  return (
    <form className="msearch" role="search" onSubmit={submit}>
      <span aria-hidden="true">{copy.search.glyph}</span>
      <input value={value} maxLength={MAX_QUERY} placeholder={copy.search.placeholder} aria-label={copy.search.placeholder} autoComplete="off" enterKeyHint="search" onChange={(e) => setValue(e.target.value)} />
    </form>
  );
}
