import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/require-admin";
import { applyScenarioDelay, mediaKeyParam, sourcesErrorResponse, sourcesPrefs } from "@/lib/http/sources-route-helpers";
import { preferredFields } from "@/lib/sources/release-pref-select";
import { getReleasePref, titleKeyOf } from "@/lib/sources/release-prefs-store";
import { getSources } from "@/lib/sources/sources-service";
import type { SourcesResponse } from "@/lib/sources/sources-types";

/**
 * GET /api/sources?mediaKey=movie:634649|tv:66732:4:1[&show4k=0|1] → {releases, best, state, slots, episode?, preferredHash, preferredApplies}
 * 503 {code:'TORBOX_UNREACHABLE', releases, …} keeps the list (dimmed) when only TorBox is down; 502 SOURCES_UNREACHABLE when Torrentio+YTS failed.
 * `preferredHash` / `preferredApplies` = the viewer's "Lần trước" release for the title (release-pref-select.ts).
 */
export async function GET(req: Request) {
  const me = await requireUserApi();
  if (me instanceof NextResponse) return me;
  const key = mediaKeyParam(req);
  if (key instanceof NextResponse) return key;
  try {
    const scenario = await applyScenarioDelay(req);
    const r = await getSources(key, sourcesPrefs(me.user.id, new URL(req.url).searchParams.get("show4k")), scenario);
    const pref = preferredFields(r.releases, getReleasePref(me.user.id, titleKeyOf(key)), key.type === "tv");
    const body: SourcesResponse = { releases: r.releases, best: r.best, state: r.state, slots: r.slots, episode: r.episode, ...pref };
    if (r.state === "torbox-down") return NextResponse.json({ code: "TORBOX_UNREACHABLE", ...body }, { status: 503 });
    return NextResponse.json(body);
  } catch (err) {
    return sourcesErrorResponse("sources", err);
  }
}
