"use client";
import { useRouter } from "next/navigation";
import { onActivate } from "@/components/ui/activate-key";
import { copy } from "@/lib/copy-vi";
import { mediaHref } from "@/lib/catalog/media-key";
import type { TitleMetaResponse } from "@/lib/tmdb/catalog-queries-detail";
import type { CardItem } from "@/lib/tmdb/catalog-types";
import { useLikeToggle, useMyListToggle } from "./use-media-toggles";

const GENRES_SHOWN = 2;

/**
 * `.hoverpanel > .acts(span.w ▶, ＋, 👍, ⌄) + .m(<b>Đã cache</b> · year · runtime|"N mùa" · ★ r) + .m(genres)`.
 * ＋/👍 open with the card's server-stamped saved / liked flags (no wrong first frame) and follow /api/catalog/meta
 * once it lands (fetched by the card as soon as it is armed); runtime shows "…" until then; genres are the
 * Vietnamese detail names (max 2, one line).
 */
export function CardHoverPanel({ item, meta }: { item: CardItem; meta: TitleMetaResponse | null }) {
  const router = useRouter();
  const list = useMyListToggle(item.mediaKey, item.title, meta?.saved ?? item.saved ?? false);
  const like = useLikeToggle(item.mediaKey, meta?.liked ?? item.liked ?? false);
  const href = mediaHref(item.type, item.tmdbId);

  const cached = item.cacheState === "cached";
  const a = copy.home.hoverActs;
  const act = (label: string, onClick: () => void, cls?: string, style?: React.CSSProperties) => (
    <span className={cls} style={style} role="button" tabIndex={0} onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick(); }} onKeyDown={onActivate(onClick)}>
      {label}
    </span>
  );
  const year = meta?.year || item.year;
  const rating = meta?.rating || item.rating;
  // "…" while the meta request is pending; a title without a runtime drops the segment instead of showing "…" forever
  const runtime = meta ? meta.runtime : copy.browse.pending;
  const metaLine = runtime ? copy.home.hoverMeta(false, year, runtime, rating) : `${year} · ★ ${rating}`;
  const genres = (meta?.genres.length ? meta.genres : item.genres).slice(0, GENRES_SHOWN).join(" · ");
  return (
    <div className="hoverpanel" onClick={(e) => e.stopPropagation()}>
      <div className="acts">
        {act(a.play, () => router.push(href), "w")}
        {act(list.saved ? a.added : a.add, () => void list.toggle())}
        {act(a.like, like.toggle, like.liked ? "w" : undefined)}
        {act(a.more, () => router.push(href), undefined, { marginLeft: "auto" })}
      </div>
      <div className="m">
        {cached && <b>{copy.tags.cached}</b>}
        {cached && " · "}
        {metaLine}
      </div>
      <div className="m" title={genres}>{genres}</div>
    </div>
  );
}
