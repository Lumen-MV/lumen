"use client";
import * as RM from "@radix-ui/react-dropdown-menu";
import { copy } from "@/lib/copy-vi";
import { cx } from "@/lib/format/class-names";
import type { SeasonSummary } from "@/lib/tmdb/catalog-types";

type Props = { seasons: SeasonSummary[]; current: number; onChange: (n: number) => void; /** Phase 4: watched episodes per season; this phase → 0 */ watchedCounts?: Record<number, number> };

/** `.dd "Mùa N ▾"` trigger → `.menu2.seasonmenu` rows "✓ Mùa N  {n tập · đã xem a/b | n tập · m tập chưa phát sóng}" (keyboard via Radix). */
export function SeasonDropdown({ seasons, current, onChange, watchedCounts = {} }: Props) {
  const s = copy.series;
  const meta = (season: SeasonSummary) => (season.unairedCount > 0 ? s.seasonUnaired(season.episodeCount, season.unairedCount) : s.seasonMeta(season.episodeCount, watchedCounts[season.n] ?? 0, season.episodeCount));
  return (
    <RM.Root modal={false}>
      <RM.Trigger asChild>
        <span className="dd" role="button" tabIndex={0} aria-haspopup="menu" data-season={current}>
          {s.season(current)}
        </span>
      </RM.Trigger>
      <RM.Portal>
        <RM.Content className="menu2 seasonmenu" align="end" sideOffset={8} loop>
          {seasons.map((season) => (
            <RM.Item key={season.n} className={cx(season.n === current && "on")} onSelect={() => onChange(season.n)} data-season={season.n}>
              {season.n === current ? copy.browse.current : ""}
              {s.seasonName(season.n)} <span style={{ color: "#888", fontSize: 12, float: "right" }}>{meta(season)}</span>
            </RM.Item>
          ))}
        </RM.Content>
      </RM.Portal>
    </RM.Root>
  );
}
