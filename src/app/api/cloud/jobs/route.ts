import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserApi } from "@/lib/auth/require-admin";
import { parseMediaKey } from "@/lib/catalog/media-key";
import { listJobsForMedia, listJobsForUser, toCloudJob } from "@/lib/cloud/cloud-jobs-store";
import { parseCloudSimSpec } from "@/lib/cloud/cloud-sim-torbox";
import { createCloudJob } from "@/lib/cloud/cloud-queue";
import { readScenario, readScenarioParams } from "@/lib/dev/scenario-flags";
import { parseJsonBody } from "@/lib/http/parse-json-body";
import { mediaKeyParam, sourcesErrorResponse, sourcesPrefs } from "@/lib/http/sources-route-helpers";
import { ALL_ROWS, getSources } from "@/lib/sources/sources-service";

const createSchema = z.object({ mediaKey: z.string().min(4).max(40), hash: z.string().regex(/^[0-9a-f]{40}$/i) });

/** GET /api/cloud/jobs?mediaKey= | ?mine=1 → {jobs} (the picker polls this every 3 s while open; TorBox is never polled per client). */
export async function GET(req: Request) {
  const me = await requireUserApi();
  if (me instanceof NextResponse) return me;
  const sp = new URL(req.url).searchParams;
  try {
    if (sp.get("mine") === "1") return NextResponse.json({ jobs: listJobsForUser(me.user.id).map(toCloudJob) });
    const key = mediaKeyParam(req);
    if (key instanceof NextResponse) return key;
    return NextResponse.json({ jobs: listJobsForMedia(key).map(toCloudJob) });
  } catch (err) {
    return sourcesErrorResponse("cloud/jobs", err);
  }
}

/**
 * POST /api/cloud/jobs {mediaKey, hash} → 201 CloudJob (queued | downloading | error). The hash must be one of the
 * title's current releases (re-derived server-side). Dev: cookie `cloud-sim=<spec>` routes the job to the fake TorBox.
 */
export async function POST(req: Request) {
  const me = await requireUserApi();
  if (me instanceof NextResponse) return me;
  const body = await parseJsonBody(req, createSchema);
  if (body instanceof NextResponse) return body;
  const key = parseMediaKey(body.mediaKey);
  if (!key) return NextResponse.json({ code: "BAD_REQUEST", issues: ["mediaKey"] }, { status: 400 });
  try {
    const scenario = readScenario(req);
    const sources = await getSources(key, { ...sourcesPrefs(me.user.id), show4k: true }, scenario, { max: ALL_ROWS });
    const release = sources.releases.find((r) => r.hash === body.hash.toLowerCase());
    if (!release) return NextResponse.json({ code: "UNKNOWN_HASH" }, { status: 404 });
    if (release.cacheState === "cached" && !scenario.has("cloud-sim")) return NextResponse.json({ code: "ALREADY_CACHED" }, { status: 409 });
    const sim = scenario.has("cloud-sim") ? parseCloudSimSpec(readScenarioParams(req).get("cloud-sim") ?? "downloading:0:25") : null;
    const { job, created } = await createCloudJob({ userId: me.user.id, userName: me.user.displayName || me.user.username, key, release, title: sources.title, sim });
    return NextResponse.json(toCloudJob(job), { status: created ? 201 : 200 });
  } catch (err) {
    return sourcesErrorResponse("cloud/jobs", err);
  }
}
