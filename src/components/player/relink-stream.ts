"use client";
import type { PlayerManifest } from "@/lib/play/player-manifest-types";
import { fetchManifest } from "./use-player-manifest";

/**
 * Link-expired relink: POST /api/play/resolve {streamId, refresh:true} → new handle → its manifest (new `src`).
 * null = TorBox did not answer / the handle itself expired (the caller counts tries, max 2).
 */
export async function relinkStream(streamId: string): Promise<PlayerManifest | null> {
  try {
    const r = await fetch("/api/play/resolve", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ streamId, refresh: true }) });
    const json = (await r.json().catch(() => null)) as { streamId?: string } | null;
    if (!r.ok || !json?.streamId) return null;
    const m = await fetchManifest(json.streamId);
    return m.ok ? m.manifest : null;
  } catch (err) {
    console.warn("[player] relink", err);
    return null;
  }
}

/** Server-side probe of the stream URL (same-origin, works in both modes): true when the link still answers 2xx. */
export async function probeStream(streamId: string): Promise<boolean> {
  try {
    const r = await fetch(`/api/play/probe?streamId=${encodeURIComponent(streamId)}`, { cache: "no-store" });
    const json = (await r.json().catch(() => null)) as { status?: number } | null;
    const status = json?.status ?? 0;
    return status >= 200 && status < 300;
  } catch {
    return false;
  }
}
