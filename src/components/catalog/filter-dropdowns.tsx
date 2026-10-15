"use client";
import * as RM from "@radix-ui/react-dropdown-menu";
import { useEffect, useState, type ReactNode } from "react";
import { copy } from "@/lib/copy-vi";
import { cx } from "@/lib/format/class-names";
import { SORT_KEYS, YEAR_PRESETS, type SortKey, type YearPreset } from "@/lib/tmdb/discover-filters";

export type GenreOption = { id: number; name: string };

/** Labels in the mockup's order map 1:1 to the URL presets. */
export const yearLabel = (y: YearPreset) => copy.browse.years[YEAR_PRESETS.indexOf(y)];
export const sortLabel = (s: SortKey) => copy.browse.sorts[SORT_KEYS.indexOf(s)];
export const qualityLabel = (q4k: boolean) => copy.browse.qualities[q4k ? 1 : 0];

type MenuProps = { chip: ReactNode; open: boolean; onOpenChange: (o: boolean) => void; children: ReactNode; className?: string };

/**
 * `.fbar .chip[.sel]` trigger + `.menu2` content on Radix DropdownMenu (same as the season dropdown):
 * Enter / Space / ↓ open and focus the first row, arrows move, Enter / Space select, Esc closes and refocuses the chip,
 * outside click closes. Items are direct `div` children of `.menu2` so the mockup's `.menu2 div` rules apply.
 */
function ChipMenu({ chip, open, onOpenChange, children, className }: MenuProps) {
  return (
    <RM.Root open={open} onOpenChange={onOpenChange} modal={false}>
      <RM.Trigger asChild>{chip}</RM.Trigger>
      <RM.Portal>
        <RM.Content className={cx("menu2", className)} align="start" sideOffset={8} loop>
          {children}
        </RM.Content>
      </RM.Portal>
    </RM.Root>
  );
}

const Chip = ({ label, sel, ...rest }: { label: string; sel?: boolean } & React.HTMLAttributes<HTMLSpanElement>) => (
  <span className={cx("chip desk", sel && "sel")} role="button" tabIndex={0} {...rest}>
    {label}
  </span>
);

/** Single-select row: "✓ " marks the current value; selecting closes the menu (Radix default). */
const Item = ({ on, children, onSelect }: { on?: boolean; children: ReactNode; onSelect: () => void }) => (
  <RM.Item className={cx(on && "on")} onSelect={onSelect}>
    {on ? copy.browse.current : ""}
    {children}
  </RM.Item>
);

/** "Năm: 3 năm qua ▾" → single-select list with "✓ " on the current preset. */
export function YearMenu({ value, onChange }: { value: YearPreset; onChange: (y: YearPreset) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <ChipMenu open={open} onOpenChange={setOpen} chip={<Chip label={copy.browse.year(yearLabel(value))} sel={open} data-filter="year" />}>
      {YEAR_PRESETS.map((y) => (
        <Item key={y} on={y === value} onSelect={() => onChange(y)}>
          {yearLabel(y)}
        </Item>
      ))}
    </ChipMenu>
  );
}

/**
 * "Thể loại: A, B ▾" → ☑/☐ multi-select (draft until applied). `.genremenu`: two columns, scrolls past 60vh,
 * "Xoá lọc" / "Áp dụng" stay pinned at the bottom (sticky) so they are always on screen.
 */
export function GenreMenu({ options, value, onChange }: { options: GenreOption[]; value: number[]; onChange: (ids: number[]) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<number[]>(value);
  useEffect(() => setDraft(value), [value, open]);
  const selected = options.filter((g) => value.includes(g.id)).map((g) => g.name).join(", ");
  const toggle = (id: number) => setDraft((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));
  return (
    <ChipMenu open={open} onOpenChange={setOpen} className="genremenu" chip={<Chip label={copy.browse.genre(selected)} sel={open || value.length > 0} data-filter="genre" />}>
      <div className="hint">{copy.browse.genreHint}</div>
      {options.map((g) => (
        <RM.CheckboxItem key={g.id} checked={draft.includes(g.id)} onCheckedChange={() => toggle(g.id)} onSelect={(e) => e.preventDefault()}>
          {draft.includes(g.id) ? copy.browse.checked : copy.browse.unchecked} {g.name}
        </RM.CheckboxItem>
      ))}
      <RM.Separator className="sep" />
      <RM.Item className="clear" onSelect={() => onChange([])}>
        {copy.common.clearFilters}
      </RM.Item>
      <RM.Item className="apply" onSelect={() => onChange(draft)}>
        {copy.browse.apply}
      </RM.Item>
    </ChipMenu>
  );
}

export function SortMenu({ value, onChange }: { value: SortKey; onChange: (s: SortKey) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <ChipMenu open={open} onOpenChange={setOpen} chip={<Chip label={copy.browse.sort(sortLabel(value))} sel={open} data-filter="sort" />}>
      {SORT_KEYS.map((s) => (
        <Item key={s} on={s === value} onSelect={() => onChange(s)}>
          {sortLabel(s)}
        </Item>
      ))}
    </ChipMenu>
  );
}

export function QualityMenu({ value, onChange }: { value: boolean; onChange: (q4k: boolean) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <ChipMenu open={open} onOpenChange={setOpen} chip={<Chip label={copy.browse.quality(qualityLabel(value))} sel={open} data-filter="quality" />}>
      {[false, true].map((q) => (
        <Item key={String(q)} on={q === value} onSelect={() => onChange(q)}>
          {qualityLabel(q)}
        </Item>
      ))}
    </ChipMenu>
  );
}
