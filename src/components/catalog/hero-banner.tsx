"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { onActivate } from "@/components/ui/activate-key";
import { copy } from "@/lib/copy-vi";
import { mediaHref } from "@/lib/catalog/media-key";
import type { HeroItem } from "@/lib/tmdb/catalog-types";
import { HeroMyListButton } from "./my-list-toggle-button";

export const HERO_ROTATE_MS = 8000;

/**
 * `.hero(.t > h1 + .meta + p + .btn×3 + .dots) + .age` — rotates through the trending top 5 every 8 s,
 * pauses on hover, dots jump, arrows appear on hover. Title = TMDB logo (vi/en/null) inside h1, else text.
 * `cacheState` (Phase 3) adds the green "● Đã cache" meta.
 */
export function HeroBanner({ items }: { items: HeroItem[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const n = items.length;

  const go = useCallback((i: number) => setIndex(((i % n) + n) % n), [n]);

  useEffect(() => {
    if (n < 2 || paused) return;
    timer.current = setInterval(() => setIndex((i) => (i + 1) % n), HERO_ROTATE_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [n, paused, index]);

  // warm the other backdrops so rotation does not flash
  useEffect(() => {
    for (const it of items) if (it.backdropUrl) new Image().src = it.backdropUrl;
  }, [items]);

  const h = items[index];
  if (!h) return null;
  const href = mediaHref(h.type, h.tmdbId);
  return (
    <div className="hero" style={h.backdropUrl ? { backgroundImage: `url(${h.backdropUrl})` } : undefined} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} data-hero-index={index} data-paused={paused}>
      <div className="t">
        <h1>{h.logoUrl ? <img className="herologo" src={h.logoUrl} alt={h.title} /> : h.title}</h1>
        <div className="meta">
          {h.cacheState === "cached" && <span className="live">{copy.home.cachedLive}</span>}
          <span>{h.year}</span>
          {h.runtime && <span>{h.runtime}</span>}
          <span className="pill">{copy.tags.hd}</span>
          <span className="pill">{h.age}</span>
          <span>★ {h.rating}</span>
        </div>
        <p>
          {h.overview}
          {h.overviewLang === "en" && (
            <>
              {" "}
              <span className="pill" title={copy.detail.enTip}>
                {copy.tags.en}
              </span>
            </>
          )}
        </p>
        <Link href={href} className="btn w">
          {copy.home.play}
        </Link>
        <Link href={href} className="btn">
          {copy.home.info}
        </Link>
        <HeroMyListButton key={h.mediaKey} mediaKey={h.mediaKey} title={h.title} saved={h.saved} />
        <div className="dots" style={{ marginTop: 14, display: "flex", gap: 6 }}>
          {items.map((it, i) => (
            <i key={it.mediaKey} role="button" tabIndex={0} aria-label={it.title} aria-current={i === index} onClick={() => go(i)} onKeyDown={onActivate(() => go(i))} style={i === index ? { width: 18, height: 3, background: "#fff" } : { width: 10, height: 3, background: "#ffffff55" }} />
          ))}
        </div>
      </div>
      <div className="age">{h.age}</div>
      {n > 1 && (
        <>
          <button type="button" className="hero-arrow l" aria-label={copy.home.prevSlide} onClick={() => go(index - 1)}>
            {copy.home.prevSlide}
          </button>
          <button type="button" className="hero-arrow r" aria-label={copy.home.nextSlide} onClick={() => go(index + 1)}>
            {copy.home.nextSlide}
          </button>
        </>
      )}
    </div>
  );
}
