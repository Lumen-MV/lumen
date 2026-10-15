"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export const AUTOHIDE_MS = 3000;

/**
 * Controls visibility: any pointer / key / touch activity shows them, 3 s of idle hides them — never while `locked`
 * (paused, popover / drawer / dialog open, pointer over the control bar).
 */
export function useControlsAutohide(locked: boolean) {
  const [visible, setVisible] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lockedRef = useRef(locked);
  lockedRef.current = locked;

  const arm = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (!lockedRef.current) setVisible(false);
    }, AUTOHIDE_MS);
  }, []);

  /** show + restart the idle timer */
  const poke = useCallback(() => {
    setVisible(true);
    arm();
  }, [arm]);

  const toggle = useCallback(() => {
    setVisible((v) => {
      if (!v) arm();
      return !v;
    });
  }, [arm]);

  useEffect(() => {
    if (locked) {
      setVisible(true);
      if (timer.current) clearTimeout(timer.current);
    } else arm();
  }, [locked, arm]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return { visible, poke, toggle };
}
