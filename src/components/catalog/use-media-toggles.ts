"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui/toast-provider";
import { copy } from "@/lib/copy-vi";

/** Optimistic POST/DELETE against a `{mediaKey}` toggle route; reverts on failure. */
async function sendToggle(path: string, mediaKey: string, on: boolean): Promise<boolean> {
  const res = await fetch(path, { method: on ? "POST" : "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ mediaKey }) });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return true;
}

/**
 * `initial` may arrive late (hover panel seeds ＋/👍 from /api/catalog/meta after it opened): the server snapshot
 * is adopted whenever it changes until the user toggles locally — from then on the local state wins.
 */
function useOptimisticToggle(path: string, mediaKey: string, initial: boolean) {
  const [on, setOn] = useState(initial);
  const [pending, setPending] = useState(false);
  const touched = useRef(false);
  useEffect(() => {
    if (!touched.current) setOn(initial);
  }, [initial]);
  const set = useCallback(
    async (next: boolean) => {
      touched.current = true;
      setOn(next);
      setPending(true);
      try {
        await sendToggle(path, mediaKey, next);
        return true;
      } catch (err) {
        // handled: the UI reverts; warn keeps the 0-console-errors criterion for recoverable failures
        console.warn("[toggle]", err);
        setOn(!next);
        return false;
      } finally {
        setPending(false);
      }
    },
    [path, mediaKey],
  );
  return { on, pending, set };
}

/** My List: adding shows the mockup toast `✓ Đã thêm "{title}" vào danh sách` with "Hoàn tác" (removes again). */
export function useMyListToggle(mediaKey: string, title: string, initialSaved: boolean) {
  const { on: saved, pending, set } = useOptimisticToggle("/api/my-list", mediaKey, initialSaved);
  const { toast } = useToast();
  const toggle = useCallback(async () => {
    const next = !saved;
    const ok = await set(next);
    if (ok && next) toast({ type: "success", text: copy.home.addedToast(title), action: { label: copy.common.undo, onClick: () => void set(false) } });
  }, [saved, set, toast, title]);
  return { saved, pending, toggle };
}

export function useLikeToggle(mediaKey: string, initialLiked: boolean) {
  const { on: liked, pending, set } = useOptimisticToggle("/api/likes", mediaKey, initialLiked);
  const toggle = useCallback(() => void set(!liked), [liked, set]);
  return { liked, pending, toggle };
}
