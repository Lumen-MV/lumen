"use client";
import { useCallback, useEffect, useRef } from "react";

/**
 * Debounced `PATCH /api/subs/prefs` for the offset / size controls: every change is merged into ONE pending patch
 * (an offset click followed by a size click within 400 ms sends both), flushed after the debounce, on unmount and
 * when the title changes (`keepalive` so the request survives navigation). `patchNow` is the immediate path (track selection).
 */
const PATCH_DEBOUNCE_MS = 400;
type Patch = Record<string, unknown>;

export async function patchPrefs(body: Patch, keepalive = false): Promise<void> {
  try {
    const r = await fetch("/api/subs/prefs", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body), keepalive });
    if (!r.ok) console.warn("[subs] prefs", r.status);
  } catch (err) {
    console.warn("[subs] prefs", err);
  }
}

export function useSubtitlePrefsPatch(mediaKey: string | null) {
  const pending = useRef<Patch>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyRef = useRef(mediaKey);

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const body = pending.current;
    pending.current = {};
    if (keyRef.current && Object.keys(body).length) void patchPrefs({ mediaKey: keyRef.current, ...body }, true);
  }, []);

  const schedule = useCallback(
    (patch: Patch) => {
      if (!keyRef.current) return;
      pending.current = { ...pending.current, ...patch };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, PATCH_DEBOUNCE_MS);
    },
    [flush],
  );

  // title change: whatever is pending belongs to the previous title → send it before switching the key
  useEffect(() => {
    flush();
    keyRef.current = mediaKey;
  }, [mediaKey, flush]);
  useEffect(() => () => flush(), [flush]);

  const patchNow = useCallback((patch: Patch) => {
    if (keyRef.current) return patchPrefs({ mediaKey: keyRef.current, ...patch });
    return Promise.resolve();
  }, []);

  return { schedule, flush, patchNow };
}
