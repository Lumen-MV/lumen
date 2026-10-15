"use client";
import Link from "next/link";
import { copy } from "@/lib/copy-vi";
import { cx } from "@/lib/format/class-names";
import { mediaHref } from "@/lib/catalog/media-key";
import type { MyListItem } from "@/lib/my-list/my-list-reducers";

type Props = { items: MyListItem[]; bulk: boolean; selected: string[]; onToggle: (mediaKey: string) => void; onRemove: (item: MyListItem) => void };

/**
 * `.grid > .card[.selected](a(img + .n) + span.rm ✕ | span.chk ✓)` — my-list.html default / hover / bulk states.
 * In bulk mode the whole card toggles selection instead of navigating.
 */
export function MyListGrid({ items, bulk, selected, onToggle, onRemove }: Props) {
  const m = copy.myList;
  return (
    <div className="grid" data-bulk={bulk || undefined}>
      {items.map((it) => {
        const on = selected.includes(it.mediaKey);
        const href = mediaHref(it.type, it.tmdbId);
        return (
          <div key={it.mediaKey} className={cx("card", bulk && "selectable", on && "selected")} data-media-key={it.mediaKey} data-selected={on || undefined} onClick={bulk ? () => onToggle(it.mediaKey) : undefined}>
            {bulk ? (
              <a role="checkbox" aria-checked={on} tabIndex={0} aria-label={it.title} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onToggle(it.mediaKey)}>
                {it.posterUrl ? <img src={it.posterUrl} alt="" loading="lazy" /> : <div className="skimg" aria-hidden="true" />}
                <div className="n">{it.title}</div>
              </a>
            ) : (
              <Link href={href} aria-label={it.title}>
                {it.posterUrl ? <img src={it.posterUrl} alt="" loading="lazy" /> : <div className="skimg" aria-hidden="true" />}
                <div className="n">{it.title}</div>
              </Link>
            )}
            {bulk ? (
              <span className="chk" aria-hidden="true">
                {on ? m.checkGlyph : ""}
              </span>
            ) : (
              <button type="button" className="rm" title={m.removeTip} aria-label={m.removeTip} data-action="remove" onClick={() => onRemove(it)}>
                {copy.common.closeGlyph}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
