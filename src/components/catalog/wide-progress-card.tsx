"use client";
import { copy } from "@/lib/copy-vi";
import { cx } from "@/lib/format/class-names";
import type { ContinueItem } from "@/lib/play/player-manifest-types";

type Props = { item: ContinueItem; busy?: boolean; onPlay: (item: ContinueItem) => void; onRemove: (item: ContinueItem) => void };

/** `.card.wide > a(img + .bar(i) + .ttl + .ep)` + hover ▶ centre / ✕ top-right — the "Tiếp tục xem" 16:9 card (mockup `card(it,{progress})`). */
export function WideProgressCard({ item, busy, onPlay, onRemove }: Props) {
  const u = copy.progressUi;
  return (
    <div className={cx("card wide", busy && "busy")} data-media-key={item.mediaKey} data-percent={item.percent} aria-busy={busy || undefined}>
      <a role="button" tabIndex={0} aria-label={item.title} onClick={() => onPlay(item)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onPlay(item)}>
        {item.backdropUrl ? <img src={item.backdropUrl} alt="" loading="lazy" /> : <div className="skimg" aria-hidden="true" />}
        <div className="bar">
          <i style={{ width: `${item.percent}%` }} />
        </div>
        <div className="ttl">{item.title}</div>
        {item.epLabel && <span className="ep">{item.epLabel}</span>}
      </a>
      <button type="button" className="playc" aria-label={copy.player.aria.play} data-action="play" onClick={() => onPlay(item)}>
        {u.playGlyph}
      </button>
      <button type="button" className="rm" title={u.removeContinue} aria-label={u.removeContinue} data-action="remove" onClick={() => onRemove(item)}>
        {u.removeGlyph}
      </button>
    </div>
  );
}
