"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { TranslateStatusDto } from "@/lib/subtitles/subtitle-types";

/**
 * `＋ Dịch sang tiếng Việt bằng AI`: POST /api/subs/translate, then GET /api/subs/translate/[jobId] every second until
 * done / error. `onDone(subId)` lets the subtitle hook refetch the list and switch to the new track, `onError` lets it
 * restore the selection shown before the job; a job already known from the search answer (reload while translating,
 * or another viewer's job on the same file) is adopted through `adopt`.
 */
export type TranslateUi = { state: "idle" | "running" | "error"; percent: number; errorMsg?: string };
export type TranslateOutcome = "started" | "exists" | "running" | "limit" | "error";
const POLL_MS = 1000;

export function useTranslateJob(onDone: (subId: number) => void, onError: () => void) {
  const [ui, setUi] = useState<TranslateUi>({ state: "idle", percent: 0 });
  const [jobId, setJobId] = useState<string | null>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const errorRef = useRef(onError);
  errorRef.current = onError;
  const fail = useCallback((percent: number, errorMsg: string | undefined) => {
    setUi({ state: "error", percent, errorMsg });
    errorRef.current();
  }, []);

  useEffect(() => {
    if (!jobId) return;
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch(`/api/subs/translate/${jobId}`, { cache: "no-store" });
        const s = (await r.json().catch(() => null)) as TranslateStatusDto | null;
        if (!alive) return;
        if (!r.ok || !s) {
          setJobId(null);
          return fail(0, `status ${r.status}`);
        }
        if (s.state === "running") return setUi({ state: "running", percent: s.percent });
        setJobId(null);
        if (s.state === "done" && s.subId !== undefined) {
          setUi({ state: "idle", percent: 100 });
          doneRef.current(s.subId);
        } else fail(s.percent, s.errorMsg);
      } catch (err) {
        console.warn("[subs] poll", err);
      }
    };
    void tick();
    const h = setInterval(() => void tick(), POLL_MS);
    return () => {
      alive = false;
      clearInterval(h);
    };
  }, [jobId, fail]);

  const adopt = useCallback((job: TranslateStatusDto | undefined) => {
    if (!job) return;
    if (job.state === "running") {
      setUi({ state: "running", percent: job.percent });
      setJobId(job.jobId);
    } else if (job.state === "error") setUi({ state: "error", percent: job.percent, errorMsg: job.errorMsg });
  }, []);

  const start = useCallback(
    async (mediaKey: string, sourceSubId: number): Promise<TranslateOutcome> => {
      setUi({ state: "running", percent: 0 });
      try {
        const r = await fetch("/api/subs/translate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mediaKey, sourceSubId }) });
        const json = (await r.json().catch(() => null)) as { jobId?: string; subId?: number; code?: string } | null;
        if (r.status === 202 && json?.jobId) {
          setJobId(json.jobId);
          return "started";
        }
        if (r.status === 200 && typeof json?.subId === "number") {
          setUi({ state: "idle", percent: 100 });
          doneRef.current(json.subId);
          return "exists";
        }
        if (r.status === 409 && json?.jobId) {
          setJobId(json.jobId);
          return "running";
        }
        if (r.status === 429) {
          setUi({ state: "idle", percent: 0 });
          errorRef.current();
          return "limit";
        }
        fail(0, json?.code ?? `status ${r.status}`);
        return "error";
      } catch (err) {
        console.warn("[subs] translate", err);
        fail(0, "network");
        return "error";
      }
    },
    [fail],
  );

  return { ui, start, adopt };
}
