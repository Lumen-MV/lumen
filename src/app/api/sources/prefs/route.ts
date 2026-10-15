import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserApi } from "@/lib/auth/require-admin";
import { parseMediaKey } from "@/lib/catalog/media-key";
import { readScenario } from "@/lib/dev/scenario-flags";
import { parseJsonBody } from "@/lib/http/parse-json-body";
import { mediaKeyParam, sourcesErrorResponse, sourcesPrefs } from "@/lib/http/sources-route-helpers";
import { preferredFields } from "@/lib/sources/release-pref-select";
import { deleteReleasePref, titleKeyOf, upsertReleasePref } from "@/lib/sources/release-prefs-store";
import { ALL_ROWS, getSources } from "@/lib/sources/sources-service";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ mediaKey: z.string().min(4).max(40), hash: z.string().regex(/^[0-9a-f]{40}$/i) });

/**
 * POST /api/sources/prefs {mediaKey, hash} → {preferredHash, preferredApplies}: the viewer explicitly picked a row in the
 * picker — remember it for the TITLE (an episode key is folded to `tv:<id>`). The hash must be in the title's current
 * release list (404 UNKNOWN_HASH); the list comes from the same memoised lookup as resolve-by-hash (no extra TorBox call).
 */
export async function POST(req: Request) {
  const me = await requireUserApi();
  if (me instanceof NextResponse) return me;
  const body = await parseJsonBody(req, bodySchema);
  if (body instanceof NextResponse) return body;
  const key = parseMediaKey(body.mediaKey);
  if (!key) return NextResponse.json({ code: "BAD_REQUEST", issues: ["mediaKey"] }, { status: 400 });
  try {
    const { releases } = await getSources(key, { ...sourcesPrefs(me.user.id), show4k: true }, readScenario(req), { max: ALL_ROWS });
    const release = releases.find((r) => r.hash === body.hash.toLowerCase());
    if (!release) return NextResponse.json({ code: "UNKNOWN_HASH" }, { status: 404 });
    const pref = upsertReleasePref(me.user.id, key, release);
    return NextResponse.json(preferredFields(releases, pref, key.type === "tv"));
  } catch (err) {
    return sourcesErrorResponse("sources/prefs", err);
  }
}

/** DELETE /api/sources/prefs?mediaKey= → {deleted:boolean} ("Quên lựa chọn"; any key of the title works). */
export async function DELETE(req: Request) {
  const me = await requireUserApi();
  if (me instanceof NextResponse) return me;
  const key = mediaKeyParam(req);
  if (key instanceof NextResponse) return key;
  try {
    return NextResponse.json({ deleted: deleteReleasePref(me.user.id, titleKeyOf(key)) });
  } catch (err) {
    console.error("[sources/prefs delete]", err instanceof Error ? err.message : err);
    return NextResponse.json({ code: "SERVER_ERROR" }, { status: 500 });
  }
}
