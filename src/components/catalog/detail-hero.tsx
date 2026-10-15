import type { ReactNode } from "react";
import { copy } from "@/lib/copy-vi";
import { cx } from "@/lib/format/class-names";
import type { OverviewLang } from "@/lib/tmdb/overview-fallback";
import { OpenAppButton, PickOtherButton } from "@/components/sources/detail-secondary-buttons";
import { LikeButton } from "./like-button";
import { MyListToggleButton } from "./my-list-toggle-button";
import { TrailerDialog } from "./trailer-dialog";

export type DetailHeroMedia = { mediaKey: string; title: string; backdropUrl: string | null; overview: string; overviewLang: OverviewLang; trailerKey: string | null };

type Props = {
  media: DetailHeroMedia;
  /** Phase 3 primary action ("▶ Phát · 1080p" …). Phase 2 passes a space-preserving placeholder. */
  primary: ReactNode;
  /** Phase 3 cache/status fact ("Đã cache · Phát trực tiếp") rendered before year; nothing in Phase 2. */
  facts: ReactNode;
  /** facts after the slot: year / runtime / HD / age / IMDb */
  factItems: ReactNode;
  kv: ReactNode;
  saved: boolean;
  liked: boolean;
  /** series: 520px hero (desktop, `.detail.series`) and "📺 Xem bằng app" before "Chọn bản khác" (screen-series.js); movie: 600px, the other way round */
  variant?: "movie" | "series";
};

/** `.detail(.in > h1 + .acts + .cols(.facts + p | .kv…))` — shared by /movie/[id] and /series/[id]; must render inside a <SourcesProvider> (secondary buttons read it). */
export function DetailHero({ media, primary, facts, factItems, kv, saved, liked, variant = "movie" }: Props) {
  const pickOther = <PickOtherButton key="pick" />;
  const openApp = <OpenAppButton key="app" />;
  return (
    <div className={cx("detail", variant === "series" && "series")} style={media.backdropUrl ? { backgroundImage: `url(${media.backdropUrl})` } : undefined}>
      <div className="in">
        <h1>{media.title}</h1>
        <div className="acts">
          {primary}
          <MyListToggleButton mediaKey={media.mediaKey} title={media.title} saved={saved} />
          <LikeButton mediaKey={media.mediaKey} liked={liked} />
          {variant === "series" ? [openApp, pickOther] : [pickOther, openApp]}
          {media.trailerKey && <TrailerDialog youtubeKey={media.trailerKey} title={media.title} />}
        </div>
        <div className="cols">
          <div>
            <div className="facts">
              {facts}
              {factItems}
            </div>
            <p>
              {media.overview}
              {media.overviewLang === "en" && media.overview && (
                <>
                  {" "}
                  <span className="pill" title={copy.detail.enTip}>
                    {copy.tags.en}
                  </span>
                </>
              )}
            </p>
          </div>
          <div>{kv}</div>
        </div>
      </div>
    </div>
  );
}

/** Phase 2 primary slot: invisible but space-preserving so the action row keeps the mockup's geometry until Phase 3 fills it. */
export function PrimarySlotPlaceholder() {
  return (
    <span className="btn w" style={{ visibility: "hidden" }} aria-hidden="true" data-slot="primary">
      {copy.detail.play}
    </span>
  );
}
