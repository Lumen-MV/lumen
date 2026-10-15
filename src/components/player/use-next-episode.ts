"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui/toast-provider";
import { copy } from "@/lib/copy-vi";
import { pickerHref, resolveNextEpisode } from "@/lib/play/next-episode";
import type { PlayerManifest } from "@/lib/play/player-manifest-types";
import { nextEpisodeDue } from "@/lib/progress/progress-rules";

export const NEXT_COUNTDOWN_S = 10;

/**
 * Next-episode card: due at ≥ 95 % / ended (tv with `next`), 10 s ring countdown when `autoplay_next` is on,
 * "▶ Phát ngay" / N key / countdown end → resolve (same pack → same hash, else best cached; nothing cached → picker).
 * Also powers the episode drawer switch and the end-of-season "Chuyển sang mùa N+1" button via `go(target)`.
 */
type Deps = { manifest: PlayerManifest | null; currentTime: number; duration: number; ended: boolean; dismissed: boolean; onBeforeLeave: () => void };

export function useNextEpisode({ manifest, currentTime, duration, ended, dismissed, onBeforeLeave }: Deps) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const going = useRef(false);

  const next = manifest?.next ?? null;
  const due = Boolean(next) && !dismissed && nextEpisodeDue(currentTime, duration, ended);

  const go = useCallback(
    async (target: { mediaKey: string; samePack: boolean; tmdbId: number; season: number; episode: number }) => {
      if (going.current || !manifest) return;
      going.current = true;
      setBusy(true);
      try {
        onBeforeLeave();
        const out = await resolveNextEpisode({ mediaKey: target.mediaKey, samePack: target.samePack, currentHash: manifest.releaseHash });
        if (out.kind === "stream") router.replace(`/watch/${out.streamId}`);
        else if (out.kind === "picker") router.push(pickerHref(target.tmdbId, target.season, target.episode));
        else toast({ type: "err", text: out.status === 503 ? copy.toastSamples.torboxDown : copy.home.errRow });
      } finally {
        going.current = false;
        setBusy(false);
      }
    },
    [manifest, onBeforeLeave, router, toast],
  );

  const goNext = useCallback(() => {
    if (next && manifest?.series) void go({ mediaKey: next.mediaKey, samePack: next.samePack, tmdbId: manifest.series.tmdbId, season: next.season, episode: next.episode });
  }, [go, manifest, next]);

  // ring countdown (autoplay_next only); reaching 0 plays the next episode. `goNext` is read through a ref: a new
  // manifest object (relink) must not restart the ring
  const goNextRef = useRef(goNext);
  goNextRef.current = goNext;
  const autoplayNext = manifest?.autoplayNext ?? false;
  useEffect(() => {
    if (!due || !autoplayNext) {
      setCountdown(null);
      return;
    }
    setCountdown(NEXT_COUNTDOWN_S);
    const started = Date.now();
    const id = setInterval(() => {
      const left = NEXT_COUNTDOWN_S - Math.floor((Date.now() - started) / 1000);
      if (left <= 0) {
        clearInterval(id);
        setCountdown(0);
        goNextRef.current();
      } else setCountdown(left);
    }, 250);
    return () => clearInterval(id);
  }, [due, autoplayNext]);

  return { next, due, countdown, busy, goNext, go };
}
