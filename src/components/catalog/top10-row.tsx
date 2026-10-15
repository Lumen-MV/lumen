"use client";
import Link from "next/link";
import { onActivate } from "@/components/ui/activate-key";
import { copy } from "@/lib/copy-vi";
import { mediaHref } from "@/lib/catalog/media-key";
import type { CardItem } from "@/lib/tmdb/catalog-types";
import { useRowScroll } from "./use-row-scroll";

type Props = { title: string; items: CardItem[]; seeAllHref?: string };

/** `section > .h + .top10(.t10 > .num + img + .tagb) + .chev` — numeral left (236px stroke), poster 140×210 right, badge (precomputed `item.badge`) inside poster. */
export function Top10Row({ title, items, seeAllHref }: Props) {
  const { ref, canLeft, canRight, page, onKeyDown } = useRowScroll();
  return (
    <section>
      <div className="h">
        <h2>{title}</h2>
        {seeAllHref && <Link href={seeAllHref}>{copy.common.seeAll}</Link>}
      </div>
      <div className="top10" ref={ref} onKeyDown={onKeyDown}>
        {items.slice(0, 10).map((it, k) => (
          <div className="t10" key={it.mediaKey} data-media-key={it.mediaKey}>
            <div className="num" aria-hidden="true">
              {k + 1}
            </div>
            <Link href={mediaHref(it.type, it.tmdbId)} aria-label={`${k + 1}. ${it.title}`}>
              {it.posterUrl ? <img src={it.posterUrl} alt="" loading="lazy" /> : <span className="skimg" aria-hidden="true" />}
            </Link>
            {it.badge && <span className="tagb">{it.badge}</span>}
          </div>
        ))}
      </div>
      {canLeft && (
        <div className="chev l" role="button" tabIndex={0} aria-label={copy.home.prevSlide} onClick={() => page(-1)} onKeyDown={onActivate(() => page(-1))}>
          {copy.home.prevSlide}
        </div>
      )}
      {canRight && (
        <div className="chev r" role="button" tabIndex={0} aria-label={copy.home.nextSlide} onClick={() => page(1)} onKeyDown={onActivate(() => page(1))}>
          {copy.home.nextSlide}
        </div>
      )}
    </section>
  );
}
