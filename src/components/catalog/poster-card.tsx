"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FocusEvent } from "react";
import { cx } from "@/lib/format/class-names";
import { mediaHref } from "@/lib/catalog/media-key";
import type { CardItem } from "@/lib/tmdb/catalog-types";
import { CardHoverPanel } from "./card-hover-panel";
import { useTitleMeta } from "./use-title-meta";

export const HOVER_DELAY_MS = 400;
/** The meta request starts this soon after enter (well before the panel) so the panel usually opens with runtime + ＋/👍 state. */
export const META_PREFETCH_MS = 150;
const canHover = () => typeof window !== "undefined" && window.matchMedia("(hover: hover) and (min-width: 901px)").matches;

type Props = { item: CardItem; badge?: string; cached?: boolean; watched?: boolean; hoverPanel?: boolean };

/**
 * `.card > a(img + .n) + .tagb` — the mockup poster card. Desktop hover ≥ 400 ms adds `.hov` + `.hoverpanel`;
 * touch / ≤ 900 px simply taps through to the detail page. `cached` / `watched` are Phase 3/4 slots.
 * Focus moving between the poster link and the panel's buttons keeps the panel open (focusout containment).
 */
export function PosterCard({ item, badge, cached, watched, hoverPanel = true }: Props) {
  const [armed, setArmed] = useState(false);
  const [hov, setHov] = useState(false);
  const timers = useRef<{ arm: ReturnType<typeof setTimeout> | null; hov: ReturnType<typeof setTimeout> | null }>({ arm: null, hov: null });
  const meta = useTitleMeta(item.mediaKey, armed);
  const clear = () => {
    if (timers.current.arm) clearTimeout(timers.current.arm);
    if (timers.current.hov) clearTimeout(timers.current.hov);
    timers.current = { arm: null, hov: null };
  };
  useEffect(() => clear, []);

  const onEnter = () => {
    if (!hoverPanel || !canHover()) return;
    clear();
    timers.current.arm = setTimeout(() => setArmed(true), META_PREFETCH_MS);
    timers.current.hov = setTimeout(() => setHov(true), HOVER_DELAY_MS);
  };
  const onLeave = () => {
    clear();
    setArmed(false);
    setHov(false);
  };
  // focus leaving to somewhere outside the card closes the panel; moving within it (link → ＋ → 👍) does not
  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onLeave();
  };
  const href = mediaHref(item.type, item.tmdbId);
  return (
    <div className={cx("card", hov && "hov", watched && "watched")} data-media-key={item.mediaKey} onMouseEnter={onEnter} onMouseLeave={onLeave} onFocus={onEnter} onBlur={onBlur}>
      <Link href={href} aria-label={item.title}>
        {item.posterUrl ? <img src={item.posterUrl} alt="" loading="lazy" /> : <div className="skimg" aria-hidden="true" />}
        {cached && <i className="cdot" aria-hidden="true" />}
        <div className="n">{item.title}</div>
      </Link>
      {badge && <span className="tagb">{badge}</span>}
      {hov && <CardHoverPanel item={item} meta={meta} />}
    </div>
  );
}
