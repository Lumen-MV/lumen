"use client";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";

/**
 * Horizontal row behaviour shared by MediaRow and Top10Row: chevrons page by the visible width,
 * `.chev.l` only once scrolled, and ←/→ move focus between the row's focusable cards.
 */
export function useRowScroll() {
  const ref = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(true);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [update]);

  const page = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth, behavior: "smooth" });

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const el = ref.current;
    if (!el) return;
    const links = [...el.querySelectorAll<HTMLElement>("a[href]")];
    const i = links.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    const next = links[i + (e.key === "ArrowRight" ? 1 : -1)];
    if (next) {
      e.preventDefault();
      next.focus();
      next.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  };

  return { ref, canLeft, canRight, page, onKeyDown };
}
