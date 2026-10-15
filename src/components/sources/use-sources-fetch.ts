"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CloudJob, SourcesResponse } from "@/lib/sources/sources-types";

/**
 * Sources for one mediaKey (+ live cloud jobs): `/api/sources?mediaKey&show4k` once per key / 4K toggle / reload, and
 * `/api/cloud/jobs?mediaKey` every 3 s while a job is active and `watchJobs` (picker open). A job turning `ready`
 * reloads the list (the row becomes cached) and reports the hash so the picker can highlight it.
 */
export type SourcesStatus = "loading" | "ready" | "error";
export const JOBS_POLL_MS = 3000;

export function useSourcesFetch(mediaKey: string, show4k: boolean, watchJobs: boolean, onJobReady?: (job: CloudJob) => void) {
  const [status, setStatus] = useState<SourcesStatus>("loading");
  const [data, setData] = useState<SourcesResponse | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Map<string, CloudJob>>(new Map());
  const [gen, setGen] = useState(0);
  const reload = useCallback(() => setGen((g) => g + 1), []);
  const prevJobs = useRef<Map<string, CloudJob>>(new Map());
  const readyCb = useRef(onJobReady);
  readyCb.current = onJobReady;

  useEffect(() => {
    const ctrl = new AbortController();
    setStatus("loading");
    setErrorCode(null);
    fetch(`/api/sources?mediaKey=${encodeURIComponent(mediaKey)}&show4k=${show4k ? 1 : 0}`, { signal: ctrl.signal })
      .then(async (r) => {
        const body = (await r.json().catch(() => null)) as (SourcesResponse & { code?: string }) | null;
        if (r.status === 503 && body?.code === "TORBOX_UNREACHABLE" && body.releases) {
          setData({ releases: body.releases, best: body.best ?? null, state: "torbox-down", slots: body.slots, episode: body.episode });
          setStatus("ready");
          return;
        }
        if (!r.ok || !body) throw new Error(body?.code ?? `sources ${r.status}`);
        setData(body);
        const next = new Map<string, CloudJob>();
        for (const rel of body.releases) if (rel.job) next.set(rel.hash, rel.job);
        prevJobs.current = next;
        setJobs(next);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if ((err as Error | null)?.name === "AbortError") return;
        console.warn("[sources]", err); // handled: empty state with Thử lại
        setErrorCode(err instanceof Error ? err.message : "error");
        setData(null);
        setStatus("error");
      });
    return () => ctrl.abort();
  }, [mediaKey, show4k, gen]);

  const active = [...jobs.values()].some((j) => j.state === "queued" || j.state === "downloading");
  useEffect(() => {
    if (!watchJobs || !active) return;
    let stopped = false;
    const tick = async () => {
      try {
        const r = await fetch(`/api/cloud/jobs?mediaKey=${encodeURIComponent(mediaKey)}`);
        if (!r.ok || stopped) return;
        const body = (await r.json()) as { jobs: CloudJob[] };
        const next = new Map<string, CloudJob>();
        for (const j of body.jobs) if (!next.has(j.hash)) next.set(j.hash, j);
        for (const [hash, j] of next) {
          const before = prevJobs.current.get(hash);
          if (j.state === "ready" && before && before.state !== "ready") {
            readyCb.current?.(j);
            reload();
          }
        }
        prevJobs.current = next;
        setJobs(next);
      } catch (err) {
        console.warn("[cloud jobs] poll failed", err);
      }
    };
    const handle = setInterval(tick, JOBS_POLL_MS);
    return () => {
      stopped = true;
      clearInterval(handle);
    };
  }, [watchJobs, active, mediaKey, reload]);

  /** optimistic job update from an action (create / cancel / retry) */
  const setJob = useCallback((hash: string, job: CloudJob | null) => {
    setJobs((m) => {
      const next = new Map(m);
      if (job) next.set(hash, job);
      else next.delete(hash);
      prevJobs.current = next;
      return next;
    });
  }, []);

  /** "Lần trước" fields patched in place after POST / DELETE /api/sources/prefs (no refetch needed) */
  const setPref = useCallback((pref: Pick<SourcesResponse, "preferredHash" | "preferredApplies">) => {
    setData((d) => (d ? { ...d, ...pref } : d));
  }, []);

  return { status, data, errorCode, jobs, reload, setJob, setPref };
}
