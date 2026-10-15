"use client";
import { useState } from "react";
import { onActivate } from "@/components/ui/activate-key";
import { copy } from "@/lib/copy-vi";
import { cx } from "@/lib/format/class-names";
import { activeFilterCount, type DiscoverFilters } from "@/lib/tmdb/discover-filters";
import { GenreMenu, QualityMenu, SortMenu, YearMenu, type GenreOption } from "./filter-dropdowns";
import { FilterSheetMobile } from "./filter-sheet-mobile";
import type { FilterPatch } from "./use-browse-filters";

type Props = { filters: DiscoverFilters; genreOptions: GenreOption[]; count: number | null; onChange: (patch: FilterPatch) => void; onClear: () => void };

/**
 * `.fbar` (sticky under the header): Năm / Thể loại / Sắp xếp / Chất lượng chips + "Chỉ phim đã cache" toggle + `.cnt`.
 * ≤ 700 px the chips collapse to one "Lọc (n)" chip that opens the bottom sheet. Count "…" while loading.
 */
export function FilterBar({ filters, genreOptions, count, onChange, onClear }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const n = activeFilterCount(filters);
  return (
    <div className="fbar">
      <YearMenu value={filters.year} onChange={(year) => onChange({ year })} />
      <GenreMenu options={genreOptions} value={filters.genres} onChange={(genres) => onChange({ genres })} />
      <SortMenu value={filters.sort} onChange={(sort) => onChange({ sort })} />
      <QualityMenu value={filters.q4k} onChange={(q4k) => onChange({ q4k })} />
      <span className={cx("chip mob", n > 0 && "sel")} role="button" tabIndex={0} data-filter="mobile" onClick={() => setSheetOpen(true)} onKeyDown={onActivate(() => setSheetOpen(true))}>
        {copy.browse.sheet.mobileChip(n)}
      </span>
      <span className="tog desk" role="switch" tabIndex={0} aria-checked={filters.cachedOnly} onClick={() => onChange({ cachedOnly: !filters.cachedOnly })} onKeyDown={onActivate(() => onChange({ cachedOnly: !filters.cachedOnly }))}>
        {copy.browse.cachedOnly} <i className={cx(filters.cachedOnly && "on")} />
      </span>
      <span className="cnt">{copy.browse.count(count === null ? copy.browse.pending : count)}</span>
      <FilterSheetMobile open={sheetOpen} onOpenChange={setSheetOpen} filters={filters} genreOptions={genreOptions} onApply={onChange} onClear={onClear} />
    </div>
  );
}
