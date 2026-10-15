"use client";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useToast } from "@/components/ui/toast-provider";
import { copy } from "@/lib/copy-vi";
import { mediaHref, parseMediaKey } from "@/lib/catalog/media-key";
import { fetchPostJson } from "@/lib/play/next-episode";

/**
 * Continue card / My List ▶: resolve the best cached release (`auto:true`) → `/watch/[id]?resume=1` (no prompt);
 * nothing cached → the detail page with the picker open (`?pick=1`); outage → toast.
 */
export function useContinuePlay() {
  const router = useRouter();
  const { toast } = useToast();
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const play = useCallback(
    async (mediaKey: string, resume = true) => {
      const key = parseMediaKey(mediaKey);
      if (!key || busyKey) return;
      setBusyKey(mediaKey);
      try {
        const r = await fetchPostJson("/api/play/resolve", { mediaKey, auto: true });
        const id = r.json?.streamId;
        if (r.status === 200 && typeof id === "string") return router.push(`/watch/${id}${resume ? "?resume=1" : ""}`);
        if (r.status === 409 || r.status === 404) {
          const base = mediaHref(key.type, key.tmdbId, key.season);
          return router.push(key.type === "tv" && key.episode !== undefined ? `${base}&e=${key.episode}&pick=1` : `${base}?pick=1`);
        }
        toast({ type: "err", text: r.status === 503 ? copy.toastSamples.torboxDown : copy.home.errRow });
      } catch (err) {
        console.warn("[continue] play", err);
        toast({ type: "err", text: copy.toastSamples.torboxDown });
      } finally {
        setBusyKey(null);
      }
    },
    [busyKey, router, toast],
  );

  return { play, busyKey };
}
