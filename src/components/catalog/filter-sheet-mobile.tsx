"use client";
import * as RD from "@radix-ui/react-dialog";
import { useEffect, useState } from "react";
import { onActivate } from "@/components/ui/activate-key";
import { Button } from "@/components/ui/button";
import { copy } from "@/lib/copy-vi";
import { cx } from "@/lib/format/class-names";
import { activeFilterCount, SORT_KEYS, YEAR_PRESETS, type DiscoverFilters, type SortKey, type YearPreset } from "@/lib/tmdb/discover-filters";
import { qualityLabel, sortLabel, yearLabel, type GenreOption } from "./filter-dropdowns";
import type { FilterPatch } from "./use-browse-filters";

type Draft = Pick<DiscoverFilters, "year" | "genres" | "sort" | "q4k" | "cachedOnly">;
type Props = { open: boolean; onOpenChange: (o: boolean) => void; filters: DiscoverFilters; genreOptions: GenreOption[]; onApply: (patch: FilterPatch) => void; onClear: () => void };

const pick = (f: DiscoverFilters): Draft => ({ year: f.year, genres: f.genres, sort: f.sort, q4k: f.q4k, cachedOnly: f.cachedOnly });

/** `.dlg(flex-end) > .sheet > h3 + .grp(b + span.on…)×4 + .acts(Xoá lọc, Áp dụng (n))` — mobile filter bottom sheet (mockup `filter-sheet`). */
export function FilterSheetMobile({ open, onOpenChange, filters, genreOptions, onApply, onClear }: Props) {
  const [draft, setDraft] = useState<Draft>(pick(filters));
  useEffect(() => {
    if (open) setDraft(pick(filters));
  }, [open, filters]);

  const chip = (on: boolean, label: string, onClick: () => void) => (
    <span key={label} className={cx(on && "on")} role="button" tabIndex={0} aria-pressed={on} onClick={onClick} onKeyDown={onActivate(onClick)}>
      {label}
    </span>
  );
  const s = copy.browse.sheet;
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal>
        <RD.Overlay className="dlg" style={{ alignItems: "flex-end", justifyContent: "stretch" }}>
          <RD.Content className="sheet" style={{ position: "static", width: "100%" }} aria-describedby={undefined}>
            <RD.Title asChild>
              <h3>{s.title}</h3>
            </RD.Title>
            <div className="grp">
              <b>{s.year}</b>
              {YEAR_PRESETS.map((y: YearPreset) => chip(draft.year === y, yearLabel(y), () => setDraft({ ...draft, year: y })))}
            </div>
            <div className="grp">
              <b>{s.genre}</b>
              {genreOptions.map((g) => chip(draft.genres.includes(g.id), g.name, () => setDraft({ ...draft, genres: draft.genres.includes(g.id) ? draft.genres.filter((x) => x !== g.id) : [...draft.genres, g.id] })))}
            </div>
            <div className="grp">
              <b>{s.sort}</b>
              {SORT_KEYS.map((k: SortKey) => chip(draft.sort === k, sortLabel(k), () => setDraft({ ...draft, sort: k })))}
            </div>
            <div className="grp">
              <b>{s.other}</b>
              {chip(draft.cachedOnly, copy.browse.cachedOnly, () => setDraft({ ...draft, cachedOnly: !draft.cachedOnly }))}
              {chip(draft.q4k, qualityLabel(true), () => setDraft({ ...draft, q4k: !draft.q4k }))}
            </div>
            <div className="acts">
              <Button onClick={() => { onClear(); onOpenChange(false); }}>{copy.common.clearFilters}</Button>
              <Button variant="white" onClick={() => { onApply(draft); onOpenChange(false); }}>{s.apply(activeFilterCount(draft))}</Button>
            </div>
          </RD.Content>
        </RD.Overlay>
      </RD.Portal>
    </RD.Root>
  );
}
