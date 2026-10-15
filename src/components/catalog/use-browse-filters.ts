"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { DEFAULT_FILTERS, filtersToQueryString, parseDiscoverFilters, type BrowseType, type DiscoverFilters } from "@/lib/tmdb/discover-filters";

export type FilterPatch = Partial<Omit<DiscoverFilters, "type" | "page">>;

/**
 * Browse filters live in the URL (`?year=&genre=&sort=&q4k=&cached=`): the hook parses them and every change
 * pushes a new history entry, so back/forward restore previous filters and links are shareable.
 */
export function useBrowseFilters(type: BrowseType) {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const query = sp.toString();
  const filters = useMemo(() => parseDiscoverFilters(type, new URLSearchParams(query)), [type, query]);

  const setFilters = useCallback(
    (patch: FilterPatch) => {
      const next = filtersToQueryString({ ...filters, ...patch });
      if (next === (query ? `?${query}` : "")) return;
      router.push(`${pathname}${next}`, { scroll: false });
    },
    [filters, pathname, query, router],
  );

  const clearFilters = useCallback(() => router.push(pathname, { scroll: false }), [pathname, router]);

  return { filters, setFilters, clearFilters, isDefault: filtersToQueryString({ ...DEFAULT_FILTERS, ...filters }) === "" };
}
