"use client";
import { useCallback, useRef, type MouseEvent, type TouchEvent } from "react";

const DOUBLE_MS = 300;
const IGNORE = ".pbar, .ptop, .sheet2, .pop, .drawer, .nextcard, .pbanner, .endscreen, .pcenter, .dlg, .menu2, button, a, [role=menuitem]";
/** React re-dispatches portal clicks (Radix menus / dialogs live in document.body) through the player: only real surface hits count. */
const onSurface = (e: { currentTarget: HTMLDivElement; target: EventTarget | null }) => e.currentTarget.contains(e.target as Node) && !(e.target as HTMLElement).closest(IGNORE);

/**
 * Touch: single tap toggles the controls, double-tap on the left / right third seeks ∓10 s.
 * Mouse: click toggles play (deferred 250 ms), double-click toggles fullscreen.
 */
type Deps = { seekBy: (d: number) => void; togglePlay: () => void; toggleFullscreen: () => void; toggleControls: () => void; pokeControls: () => void };

export function useTouchGestures({ seekBy, togglePlay, toggleFullscreen, toggleControls, pokeControls }: Deps) {
  const lastTap = useRef(0);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onTouchEnd = useCallback(
    (e: TouchEvent<HTMLDivElement>) => {
      if (!onSurface(e)) return;
      const now = Date.now();
      const t = e.changedTouches[0];
      const rect = e.currentTarget.getBoundingClientRect();
      const x = (t.clientX - rect.left) / rect.width;
      if (now - lastTap.current < DOUBLE_MS) {
        lastTap.current = 0;
        if (x < 1 / 3) seekBy(-10);
        else if (x > 2 / 3) seekBy(10);
        else togglePlay();
        pokeControls();
        return;
      }
      lastTap.current = now;
      toggleControls();
    },
    [seekBy, togglePlay, toggleControls, pokeControls],
  );

  const onClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      // touch taps are handled by onTouchEnd (toggle controls / double-tap seek); the synthesized click must not toggle play
      if (e.detail === 0 || (e.nativeEvent as PointerEvent).pointerType === "touch" || !onSurface(e)) return;
      // a click on the surface drops focus from the last used control, so the next Space / arrow is a player hotkey
      // (the root itself is not focusable: a tabIndex on the fixed full-screen div makes Chromium refuse gesture-less play())
      if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) document.activeElement.blur();
      if (clickTimer.current) clearTimeout(clickTimer.current);
      clickTimer.current = setTimeout(() => {
        clickTimer.current = null;
        togglePlay();
      }, 250);
    },
    [togglePlay],
  );

  const onDoubleClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (!onSurface(e)) return;
      if (clickTimer.current) {
        clearTimeout(clickTimer.current);
        clickTimer.current = null;
      }
      void toggleFullscreen();
    },
    [toggleFullscreen],
  );

  return { onTouchEnd, onClick, onDoubleClick };
}
