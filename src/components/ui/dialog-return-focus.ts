"use client";
import { useCallback, useEffect } from "react";

/**
 * Where focus goes when a dialog closes. Radix returns it to its own `DialogTrigger`, which our dialogs never use
 * (they open from state — buttons, ⋯ menu items, API results), so we track the last element focused OUTSIDE any dialog
 * or menu and hand focus back to it; a trigger that vanished meanwhile (deleted row) leaves the Radix default in place.
 */
const INSIDE_OVERLAY = ".dlg, .menu2";
let lastOutside: HTMLElement | null = null;
let tracking = false;

function track(): void {
  if (tracking || typeof document === "undefined") return;
  tracking = true;
  document.addEventListener("focusin", (e) => {
    const el = e.target as HTMLElement | null;
    if (el && el !== document.body && !el.closest(INSIDE_OVERLAY)) lastOutside = el;
  });
}

export function useDialogReturnFocus(): (e: Event) => void {
  useEffect(track, []);
  return useCallback((e: Event) => {
    const el = lastOutside;
    if (!el || !el.isConnected) return;
    e.preventDefault();
    el.focus({ preventScroll: true });
  }, []);
}
