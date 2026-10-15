"use client";
import { useCallback, useEffect, useState } from "react";
import type { ManifestError, PlayerManifest } from "@/lib/play/player-manifest-types";

/** Loads GET /api/play/manifest?streamId= (the only way the player learns `src`); 410 / 429 / 401 become typed errors. */
export type ManifestStatus = { status: "loading"; manifest: null; error: null } | { status: "ready"; manifest: PlayerManifest; error: null } | { status: "error"; manifest: PlayerManifest | null; error: ManifestError };

export async function fetchManifest(streamId: string): Promise<{ ok: true; manifest: PlayerManifest } | { ok: false; error: ManifestError }> {
  try {
    const r = await fetch(`/api/play/manifest?streamId=${encodeURIComponent(streamId)}`, { cache: "no-store" });
    const json = (await r.json().catch(() => null)) as (PlayerManifest & Partial<ManifestError>) | null;
    if (r.ok && json?.src) return { ok: true, manifest: json };
    const code = json?.code === "LIMIT_5" || json?.code === "STREAM_EXPIRED" || json?.code === "AUTH_REQUIRED" ? json.code : "SERVER_ERROR";
    return { ok: false, error: { code, active: json?.active } };
  } catch (err) {
    console.warn("[player] manifest", err);
    return { ok: false, error: { code: "SERVER_ERROR" } };
  }
}

export function usePlayerManifest(streamId: string) {
  const [state, setState] = useState<ManifestStatus>({ status: "loading", manifest: null, error: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setState({ status: "loading", manifest: null, error: null });
    fetchManifest(streamId).then((r) => {
      if (!alive) return;
      setState(r.ok ? { status: "ready", manifest: r.manifest, error: null } : { status: "error", manifest: null, error: r.error });
    });
    return () => {
      alive = false;
    };
  }, [streamId, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  /** relink: swap in the manifest of the refreshed stream handle */
  const replace = useCallback((manifest: PlayerManifest) => setState({ status: "ready", manifest, error: null }), []);
  return { ...state, reload, replace };
}
