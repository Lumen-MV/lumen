import type { KeyboardEvent } from "react";

/**
 * Enter AND Space activate the mockup's non-native controls (`span[role=button|switch|link]`, `div[role=button]`),
 * matching the native button contract keyboard / TV-remote users expect. Space is prevented so the page does not scroll.
 */
export function onActivate<E extends Element = HTMLElement>(fn: () => void) {
  return (e: KeyboardEvent<E>) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    fn();
  };
}
