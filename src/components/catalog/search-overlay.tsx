"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { copy } from "@/lib/copy-vi";
import type { CardItem } from "@/lib/tmdb/catalog-types";
import { MAX_QUERY, MIN_QUERY, OVERLAY_RESULT_LIMIT, SEARCH_DEBOUNCE_MS } from "@/lib/tmdb/search-query-rules";
import { OPEN_SEARCH_EVENT } from "./search-open-event";
import { SearchOverlayEmpty, SearchOverlayRecent, SearchOverlayResults } from "./search-overlay-results";
import { useRecentSearches } from "./use-recent-searches";

type State = { status: "idle" | "loading" | "done" | "error"; items: CardItem[]; total: number; for: string };
const IDLE: State = { status: "idle", items: [], total: 0, for: "" };
const EDITABLE = /^(INPUT|TEXTAREA|SELECT)$/;

/**
 * `.sov > .inp(🔍 input ✕|⟳) + .dd` — opens from the header 🔍, `/`, or the mobile tab bar (OPEN_SEARCH_EVENT);
 * ≤ 700 px it is a full-screen sheet under the header (CSS). Closes on Esc / ✕ / outside click.
 * ≥ 2 chars → 300 ms debounce → ≤ 8 results with <mark>; empty input → recent searches; Enter → /search?q=.
 */
export function SearchOverlay({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [state, setState] = useState<State>(IDLE);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const recent = useRecentSearches(open);

  // `/` opens (outside inputs), Esc closes, the tab bar asks via a window event
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = Boolean(t && (EDITABLE.test(t.tagName) || t.isContentEditable));
      if (e.key === "/" && !typing && !open) {
        e.preventDefault();
        onOpenChange(true);
      } else if (e.key === "Escape" && open) onOpenChange(false);
    };
    const onOpenRequest = () => onOpenChange(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_SEARCH_EVENT, onOpenRequest);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_SEARCH_EVENT, onOpenRequest);
    };
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onOpenChange(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, onOpenChange]);

  // debounced fetch
  useEffect(() => {
    const query = q.trim();
    if (query.length < MIN_QUERY) {
      setState(IDLE);
      return;
    }
    setState((s) => ({ ...s, status: "loading" }));
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/catalog/search?q=${encodeURIComponent(query)}&page=1&type=all`, { signal: ctrl.signal });
        if (!res.ok) throw new Error(`search ${res.status}`);
        const data = (await res.json()) as { items: CardItem[]; counts: { all: number } };
        setState({ status: "done", items: data.items.slice(0, OVERLAY_RESULT_LIMIT), total: data.counts.all, for: query });
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        console.warn("[search]", err); // handled: the overlay shows the empty/error copy
        setState({ status: "error", items: [], total: 0, for: query });
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const close = () => {
    onOpenChange(false);
    setQ("");
  };
  const goSearch = (query = q) => {
    const t = query.trim();
    if (t.length < MIN_QUERY) return;
    recent.add(t);
    close();
    router.push(`/search?q=${encodeURIComponent(t)}`);
  };
  if (!open) return null;

  const query = q.trim();
  const showRecent = query.length < MIN_QUERY;
  const loading = state.status === "loading";
  return (
    <div className="sov" ref={rootRef} role="search" data-status={state.status}>
      <div className="inp">
        {copy.search.glyph}
        <input ref={inputRef} value={q} maxLength={MAX_QUERY} placeholder={copy.search.placeholder} aria-label={copy.search.placeholder} autoComplete="off" enterKeyHint="search" onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && goSearch()} />
        {loading ? (
          <span style={{ color: "#888" }}>{copy.search.loadingGlyph}</span>
        ) : (
          <button type="button" className="x" aria-label={copy.common.close} onClick={close}>
            {copy.common.closeGlyph}
          </button>
        )}
      </div>
      {showRecent && <SearchOverlayRecent recent={recent.recent} onPick={(r) => goSearch(r)} onRemove={recent.remove} onClear={recent.clear} />}
      {!showRecent && state.status === "done" && state.for === query && (state.items.length ? <SearchOverlayResults items={state.items} query={query} total={state.total} onPick={() => { recent.add(query); close(); }} onSeeAll={() => goSearch()} /> : <SearchOverlayEmpty query={query} />)}
      {!showRecent && state.status === "error" && <SearchOverlayEmpty query={query} />}
    </div>
  );
}
