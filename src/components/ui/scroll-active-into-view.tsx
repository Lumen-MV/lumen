"use client";
import { useEffect } from "react";

/**
 * Horizontal tab strips (`.atabs`, settings `nav2`) scroll on phones; after navigation the active tab may sit past the
 * right edge. Scrolls the first element matching `selector` into view (inline only — never moves the page vertically).
 */
export function ScrollActiveIntoView({ selector }: { selector: string }) {
  useEffect(() => {
    const el = document.querySelector<HTMLElement>(selector);
    el?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [selector]);
  return null;
}
