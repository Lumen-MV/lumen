"use client";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { onActivate } from "@/components/ui/activate-key";
import { copy } from "@/lib/copy-vi";
import type { CardItem } from "@/lib/tmdb/catalog-types";
import { PosterCard } from "./poster-card";
import { RefreshErrorBox } from "./refresh-error-box";
import { useRowScroll } from "./use-row-scroll";

type Props = {
  title: string;
  /** cards carry their precomputed `badge` ("Mùa mới", "Mới thêm") — server pages set it */
  items?: CardItem[];
  seeAllHref?: string;
  /** row failed → inline errbox "Không tải được hàng này" + Thử lại */
  error?: boolean;
  /** continue row renders wide cards here instead of PosterCards */
  children?: ReactNode;
  /** replaces the "Xem tất cả ›" link (My List: "Xoá lịch sử") */
  headerAction?: ReactNode;
  /** inline style of the <section> itself (My List: the mockup's `margin-top:20px`) — never wrap the row in another padded section */
  style?: CSSProperties;
};

/** `section > .h(h2 + a) + .row(cards) + .chev.r/.l` — scroll-snap page, chevrons on hover (keyboard-reachable), ←/→ move focus. */
export function MediaRow({ title, items = [], seeAllHref, error, children, headerAction, style }: Props) {
  const { ref, canLeft, canRight, page, onKeyDown } = useRowScroll();
  return (
    <section style={style}>
      <div className="h">
        <h2>{title}</h2>
        {headerAction ?? (seeAllHref && <Link href={seeAllHref}>{copy.common.seeAll}</Link>)}
      </div>
      {error ? (
        <RefreshErrorBox message={copy.home.errRow} />
      ) : (
        <>
          <div className="row" ref={ref} onKeyDown={onKeyDown}>
            {children ?? items.map((it) => <PosterCard key={it.mediaKey} item={it} badge={it.badge} cached={it.cacheState === "cached"} watched={it.watched} />)}
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
        </>
      )}
    </section>
  );
}
