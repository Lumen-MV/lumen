import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserApi } from "@/lib/auth/require-admin";
import { parseMediaKey } from "@/lib/catalog/media-key";
import { getEnv } from "@/lib/config/env";
import { readScenario, readScenarioParams } from "@/lib/dev/scenario-flags";
import { parseJsonBody } from "@/lib/http/parse-json-body";
import { sourcesErrorResponse, sourcesPrefs, viewerIp } from "@/lib/http/sources-route-helpers";
import { streamMode } from "@/lib/play/build-player-manifest";
import { NoVideoFileError, resolveCdnStream } from "@/lib/play/resolve-cdn-stream";
import { viewerIpForStreamMode } from "@/lib/play/viewer-ip-for-stream-mode";
import { isSampleEntry, registerSampleStream, sampleGeneration, sampleVariantFor } from "@/lib/play/sample-stream";
import { getStream, registerStream, type StreamEntry } from "@/lib/play/stream-registry";
import { selectPreferredRelease } from "@/lib/sources/release-pref-select";
import { getReleasePref, titleKeyOf } from "@/lib/sources/release-prefs-store";
import { ALL_ROWS, getSources } from "@/lib/sources/sources-service";
import { getCdnLink } from "@/lib/torbox/torbox-link-cache";
import type { Release, ResolveResponse } from "@/lib/sources/sources-types";

const mediaKey = z.string().min(4).max(40);
const pickReason = z.enum(["primary", "row"]).optional();
const bodySchema = z.union([
  z.object({ mediaKey, hash: z.string().regex(/^[0-9a-f]{40}$/i), fileId: z.number().int().nonnegative().optional(), pickReason }),
  z.object({ mediaKey, auto: z.literal(true) }),
  z.object({ streamId: z.string().regex(/^[0-9a-f]{32}$/), refresh: z.literal(true) }),
]);

const answer = (e: StreamEntry) => NextResponse.json({ streamId: e.streamId, playClass: e.playClass, fileName: e.fileName, hash: e.release.hash } satisfies ResolveResponse);

/**
 * POST /api/play/resolve
 *   {mediaKey, hash, fileId?, pickReason?} | {mediaKey, auto:true} → {streamId, playClass, fileName, hash}: ensure torrent (add_only_if_cached) →
 *   pick video file (S/E for packs) → requestdl (50-min cache) → registry. 409 NOT_CACHED · 404 NO_VIDEO_FILE / UNKNOWN_HASH · 503 TORBOX_UNREACHABLE.
 *   `auto` and `pickReason:'primary'` (hero ▶ / continue card / episode row) honour the viewer's remembered "Lần trước" release
 *   while it is cached (release-pref-select.ts); `pickReason:'row'` (an explicit picker row) always plays the given hash.
 *   {streamId, refresh:true} → link-expired relink: a NEW handle for the same release/file with a fresh `requestdl` (410 STREAM_EXPIRED).
 * Dev scenario `play-sample` answers the local ffmpeg sample instead of TorBox. The CDN URL never leaves the server here.
 */
export async function POST(req: Request) {
  const me = await requireUserApi();
  if (me instanceof NextResponse) return me;
  const body = await parseJsonBody(req, bodySchema);
  if (body instanceof NextResponse) return body;
  const scenario = readScenario(req);
  // proxy mode: the VM fetches the CDN, so the link must not be pinned to the viewer's IP
  const ip = viewerIpForStreamMode(streamMode(readScenarioParams(req)), viewerIp(req, getEnv().TRUST_PROXY === "1"));
  try {
    if ("refresh" in body) {
      const old = getStream(body.streamId, me.user.id);
      if (!old) return NextResponse.json({ code: "STREAM_EXPIRED" }, { status: 410 });
      if (isSampleEntry(old)) {
        if (readScenarioParams(req).get("link-expired") === "fail") return NextResponse.json({ code: "TORBOX_UNREACHABLE" }, { status: 503 });
        const { variant, gen } = sampleGeneration(old);
        return answer(registerSampleStream(me.user.id, old.mediaKey, variant, gen + 1));
      }
      if (scenario.has("torbox-down")) return NextResponse.json({ code: "TORBOX_UNREACHABLE" }, { status: 503 });
      const cdnUrl = await getCdnLink(old.torrentId, old.fileId, ip, Date.now(), true);
      return answer(registerStream({ cdnUrl, torrentId: old.torrentId, fileId: old.fileId, fileName: old.fileName, userId: me.user.id, mediaKey: old.mediaKey, release: old.release, playClass: old.playClass }));
    }
    const key = parseMediaKey(body.mediaKey);
    if (!key) return NextResponse.json({ code: "BAD_REQUEST", issues: ["mediaKey"] }, { status: 400 });
    const sample = sampleVariantFor(scenario, readScenarioParams(req));
    if (sample) return answer(registerSampleStream(me.user.id, body.mediaKey, sample));
    let release: Release | undefined;
    const primary = "auto" in body || body.pickReason === "primary";
    const preferred = (releases: Release[]) => (primary ? selectPreferredRelease(releases, getReleasePref(me.user.id, titleKeyOf(key)), key.type === "tv").release : null);
    if ("auto" in body) {
      // the remembered release, else the best cached row for the viewer's own prefs: direct first, then maybe, then anything cached
      const { releases } = await getSources(key, sourcesPrefs(me.user.id), scenario);
      const cached = releases.filter((r) => r.cacheState === "cached");
      release = preferred(releases) ?? cached.find((r) => r.playClass === "direct") ?? cached.find((r) => r.playClass === "maybe") ?? cached[0];
    } else {
      const { releases } = await getSources(key, { ...sourcesPrefs(me.user.id), show4k: true }, scenario, { max: ALL_ROWS });
      release = preferred(releases) ?? releases.find((r) => r.hash === body.hash.toLowerCase());
    }
    if (!release) return NextResponse.json({ code: "auto" in body ? "NOT_CACHED" : "UNKNOWN_HASH" }, { status: "auto" in body ? 409 : 404 });
    const fileId = "fileId" in body ? body.fileId : undefined;
    const { torrent, file, cdnUrl } = await resolveCdnStream({ hash: release.hash, title: release.title, fileId, season: key.season, episode: key.episode, viewerIp: ip });
    const fileName = file.short_name ?? file.name.split("/").pop() ?? file.name;
    return answer(registerStream({ cdnUrl, torrentId: torrent.torrentId, fileId: file.id, fileName, userId: me.user.id, mediaKey: body.mediaKey, release: { hash: release.hash, title: release.title, qualityLabel: release.qualityLabel }, playClass: release.playClass }));
  } catch (err) {
    if (err instanceof NoVideoFileError) return NextResponse.json({ code: "NO_VIDEO_FILE" }, { status: 404 });
    return sourcesErrorResponse("play/resolve", err);
  }
}
