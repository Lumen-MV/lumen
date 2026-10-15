"use client";
import { useEffect, useRef, type RefObject } from "react";

/**
 * Player key map (spec phase-05): Space/K play-pause · ←/→ and J/L ±10 s · ↑/↓ volume · M mute · F fullscreen ·
 * C subtitles (Phase 5) · N next episode · Esc close panel / exit fullscreen · ? help.
 *
 * Listens in the BUBBLE phase on `document` (not `window` capture): a key is only handled when it comes from the
 * player root or from <body> (focus lost after a dialog closed / controls auto-hid) — never from a Radix dialog / menu
 * (portaled outside the root) nor from an editable field. Keys that activate or navigate a focused control are left to
 * the control: Space / Enter on any button ("Xem từ đầu" clicks, ↻10 seeks), arrows on menu items / options / sliders
 * (↑/↓ in the speed menu move the highlight, ←/→ on the seek track). Arrows on a plain button stay player hotkeys.
 * Handled keys stop here so the shell's `/` search and `?` help never fire.
 */
export type KeyboardHandlers = {
  togglePlay: () => void;
  seekBy: (d: number) => void;
  volumeBy: (d: number) => void;
  toggleMute: () => void;
  toggleFullscreen: () => void;
  cycleSubtitles: () => void;
  nextEpisode: () => void;
  escape: () => void;
  help: () => void;
  /** every handled key also counts as activity (controls re-appear) */
  activity: () => void;
};

const EDITABLE = /^(INPUT|TEXTAREA|SELECT)$/;
/** a focused control keeps Space / Enter (activation) … */
const ACTIVATABLE = "button, [role=button], [role=menuitem], [role=option], [role=slider], [role=checkbox], [role=switch]";
/** … and only widgets that navigate with arrows keep ↑↓←→ (a plain button has no arrow behaviour: those stay player hotkeys) */
const ARROW_NAV = "[role=menuitem], [role=option], [role=slider], [role=radio], [role=tab], [role=menu], [role=listbox]";
const SURFACE = ".dlg, .menu2, [role=dialog], [role=menu], [role=listbox]";
const ACTIVATE_KEYS = new Set([" ", "Enter"]);
const ARROW_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]);

export function usePlayerKeyboard(handlers: KeyboardHandlers, rootRef: RefObject<HTMLElement | null>, enabled = true) {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const root = rootRef.current;
      const fromBody = !target || target === document.body || target === document.documentElement;
      if (!fromBody && !(root && target && root.contains(target))) return; // portals (dialogs, menus), header, …
      if (target && !fromBody) {
        if (EDITABLE.test(target.tagName) || target.isContentEditable) return;
        if (target.closest(SURFACE)) {
          // keys inside a player surface (subtitle popover …) belong to it — but the shell's `?` help / `/` search must still not fire
          if (e.key === "?" || e.key === "/") {
            e.preventDefault();
            e.stopPropagation();
          }
          return;
        }
        if (ACTIVATE_KEYS.has(e.key) && target.closest(ACTIVATABLE)) return;
        if (ARROW_KEYS.has(e.key) && target.closest(ARROW_NAV)) return;
      }
      const h = ref.current;
      const map: Record<string, (() => void) | undefined> = {
        " ": h.togglePlay,
        k: h.togglePlay,
        ArrowLeft: () => h.seekBy(-10),
        ArrowRight: () => h.seekBy(10),
        j: () => h.seekBy(-10),
        l: () => h.seekBy(10),
        ArrowUp: () => h.volumeBy(0.1),
        ArrowDown: () => h.volumeBy(-0.1),
        m: h.toggleMute,
        f: h.toggleFullscreen,
        c: h.cycleSubtitles,
        n: h.nextEpisode,
        Escape: h.escape,
        "?": h.help,
      };
      const key = e.key.length === 1 && e.key !== " " && e.key !== "?" ? e.key.toLowerCase() : e.key;
      const fn = map[key];
      // "/" (global search) is swallowed inside the player
      if (!fn && key !== "/") return;
      e.preventDefault();
      e.stopPropagation();
      fn?.();
      h.activity();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [enabled, rootRef]);
}
