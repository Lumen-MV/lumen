"use client";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useToast } from "@/components/ui/toast-provider";
import { copy } from "@/lib/copy-vi";
import { watchHref, type PlayOptions } from "@/lib/play/watch-href";
import type { CloudJob, Release, ResolveResponse, SourcesResponse } from "@/lib/sources/sources-types";

/**
 * Row / hero actions: play (resolve → /watch/[streamId], `?resume=1` from a continue card / "▶ Tiếp tục", `?t=0` for
 * "Xem từ đầu", `?t=N` from a QR deep link), app hand-off (resolve → the hand-off sheet, Phase 4), cloud (POST job + "ℹ Đang tải lên cloud…" toast),
 * cancel (DELETE), retry (POST retry), remember (POST /api/sources/prefs — an explicit picker row becomes the title's "Lần trước").
 * `pick` tells resolve who chose the row: `primary` (hero ▶ / episode row — the server may swap in the remembered release)
 * or `row` (the picker — always this hash). Errors become toasts; `busyHash` marks the row whose request is in flight.
 */
export type PickReason = "primary" | "row";
type PrefFields = Pick<SourcesResponse, "preferredHash" | "preferredApplies">;
type Deps = { mediaKey: string; setJob: (hash: string, job: CloudJob | null) => void; setPref: (pref: PrefFields) => void; reload: () => void; onHandoff: (streamId: string) => void };
export { watchHref, type PlayOptions } from "@/lib/play/watch-href";

async function postJson<T>(path: string, body: unknown, method = "POST"): Promise<{ ok: boolean; status: number; json: T | null }> {
  const r = await fetch(path, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = (await r.json().catch(() => null)) as T | null;
  return { ok: r.ok, status: r.status, json };
}

export function useSourceActions({ mediaKey, setJob, setPref, reload, onHandoff }: Deps) {
  const router = useRouter();
  const { toast } = useToast();
  const [busyHash, setBusyHash] = useState<string | null>(null);

  const resolve = useCallback(
    async (release: Release, pick: PickReason): Promise<ResolveResponse | null> => {
      setBusyHash(release.hash);
      try {
        const r = await postJson<ResolveResponse & { code?: string }>("/api/play/resolve", { mediaKey, hash: release.hash, pickReason: pick });
        if (!r.ok || !r.json?.streamId) {
          const code = r.json?.code;
          toast({ type: "err", text: r.status === 503 ? copy.toastSamples.torboxDown : code === "NOT_CACHED" ? copy.picker.bannerUncached : code === "NO_VIDEO_FILE" ? copy.picker.noEpisodeFile : copy.home.errRow });
          if (r.json?.code === "NOT_CACHED") reload();
          return null;
        }
        return r.json;
      } catch (err) {
        console.warn("[resolve]", err);
        toast({ type: "err", text: copy.toastSamples.torboxDown });
        return null;
      } finally {
        setBusyHash(null);
      }
    },
    [mediaKey, reload, toast],
  );

  const play = useCallback(
    async (release: Release, opts: PlayOptions = {}, pick: PickReason = "row") => {
      const r = await resolve(release, pick);
      if (r) router.push(watchHref(r.streamId, opts));
    },
    [resolve, router],
  );

  /** "📺 Xem bằng app" / "Mở bằng app": resolve, then the hand-off sheet (Stremio / Infuse / VLC / copy / QR) for that stream. */
  const app = useCallback(
    async (release: Release, pick: PickReason = "row") => {
      const r = await resolve(release, pick);
      if (r) onHandoff(r.streamId);
    },
    [resolve, onHandoff],
  );

  const cloud = useCallback(
    async (release: Release) => {
      setBusyHash(release.hash);
      try {
        const r = await postJson<CloudJob & { code?: string }>("/api/cloud/jobs", { mediaKey, hash: release.hash });
        if (!r.ok || !r.json?.id) {
          toast({ type: "err", text: r.status === 503 ? copy.toastSamples.torboxDown : copy.home.errRow });
          return;
        }
        setJob(release.hash, r.json);
        if (r.status === 201) toast({ type: "info", text: copy.picker.cloudToast });
      } catch (err) {
        console.warn("[cloud]", err);
        toast({ type: "err", text: copy.toastSamples.torboxDown });
      } finally {
        setBusyHash(null);
      }
    },
    [mediaKey, setJob, toast],
  );

  const cancel = useCallback(
    async (job: CloudJob) => {
      const r = await fetch(`/api/cloud/jobs/${job.id}`, { method: "DELETE" });
      if (r.ok || r.status === 404) setJob(job.hash, null);
      else toast({ type: "err", text: copy.home.errRow });
    },
    [setJob, toast],
  );

  const retry = useCallback(
    async (job: CloudJob) => {
      const r = await postJson<CloudJob>(`/api/cloud/jobs/${job.id}/retry`, undefined);
      if (r.ok && r.json) setJob(job.hash, r.json);
      else toast({ type: "err", text: copy.home.errRow });
    },
    [setJob, toast],
  );

  /** Explicit picker pick → the title's "Lần trước"; silent on failure (the pick itself still runs). `keepalive`: ▶ Phát navigates to /watch right away. */
  const remember = useCallback(
    async (release: Release) => {
      try {
        const res = await fetch("/api/sources/prefs", { method: "POST", keepalive: true, headers: { "content-type": "application/json" }, body: JSON.stringify({ mediaKey, hash: release.hash }) });
        const json = (await res.json().catch(() => null)) as (PrefFields & { code?: string }) | null;
        if (res.ok && json) setPref({ preferredHash: json.preferredHash ?? null, preferredApplies: Boolean(json.preferredApplies) });
        else console.warn("[prefs] save failed", res.status, json?.code);
      } catch (err) {
        console.warn("[prefs] save failed", err);
      }
    },
    [mediaKey, setPref],
  );

  /** "Quên lựa chọn" (picker footer). */
  const forget = useCallback(async () => {
    try {
      const r = await fetch(`/api/sources/prefs?mediaKey=${encodeURIComponent(mediaKey)}`, { method: "DELETE" });
      if (!r.ok) throw new Error(`prefs delete ${r.status}`);
      setPref({ preferredHash: null, preferredApplies: false });
    } catch (err) {
      console.warn("[prefs] delete failed", err);
      toast({ type: "err", text: copy.home.errRow });
    }
  }, [mediaKey, setPref, toast]);

  return { play, app, cloud, cancel, retry, remember, forget, busyHash };
}

export type SourceActions = ReturnType<typeof useSourceActions>;
