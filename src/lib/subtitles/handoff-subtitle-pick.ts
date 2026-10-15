import "server-only";
import { getEnv } from "@/lib/config/env";
import type { ScenarioFlag } from "@/lib/dev/scenario-flags-shared";
import type { StreamEntry } from "@/lib/play/stream-registry";
import { getUserSettings } from "@/lib/users/user-settings";
import { signedSubtitlePath } from "./signed-subtitle-url";
import { autoSelectTrack } from "./subtitle-auto-select";
import { tracksFromRows } from "./subtitle-search-service";
import { ensureSimRows, simRowsFor, simStateFor } from "./subtitle-sim";
import { getSubtitlePrefs, hasVtt, listSubRows } from "./subtitle-store";

/** What `/api/play/external` attaches to a hand-off link: the track's label + a signed, session-less `.srt` URL (path-style, extension last). */
export type HandoffSubtitle = { label: string; url: string };

/**
 * The subtitle an external app should get: the viewer's selection for this title, else the auto-select rule (best vi
 * per `sub_lang`), exactly like the player — but from the cached rows only (never a provider search). Embedded tracks
 * need the stream handle to extract, which the signed route does not carry: they count only once their VTT exists.
 */
export function pickHandoffSubtitle(userId: number, mediaKey: string, scenario: Set<ScenarioFlag>, params: Map<ScenarioFlag, string>, entry: StreamEntry | null, nowMs = Date.now()): HandoffSubtitle | null {
  const sim = simStateFor(params, entry);
  const rows = (sim ? simRowsFor(sim, ensureSimRows(mediaKey)) : listSubRows(mediaKey)).filter((r) => r.source !== "embedded" || hasVtt(r));
  const tracks = tracksFromRows(rows, scenario, entry);
  const settings = getUserSettings(userId);
  const id = autoSelectTrack(tracks, getSubtitlePrefs(userId, mediaKey, settings.sub_size).selectedSubId, settings.sub_lang);
  const track = id === null ? null : (tracks.find((t) => t.id === id) ?? null);
  if (!track) return null;
  const env = getEnv();
  return { label: track.label, url: `${env.APP_URL.replace(/\/$/, "")}${signedSubtitlePath(track.id, "srt", env.SESSION_SECRET, nowMs)}` };
}
