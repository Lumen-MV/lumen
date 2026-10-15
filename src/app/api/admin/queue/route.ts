import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminQueue, prioritizeJob } from "@/lib/admin/admin-queue-service";
import { requireAdminApi } from "@/lib/auth/require-admin";
import { readScenario } from "@/lib/dev/scenario-flags";
import { parseJsonBody } from "@/lib/http/parse-json-body";

export const dynamic = "force-dynamic";

const patchSchema = z.object({ id: z.number().int().positive(), action: z.literal("prioritize") });

/** GET /api/admin/queue → {active, failed, doneToday, slots:{active,limit,plan}} (cancel / retry / delete reuse /api/cloud/jobs/[id]). */
export async function GET(req: Request) {
  const me = await requireAdminApi();
  if (me instanceof NextResponse) return me;
  try {
    return NextResponse.json(await getAdminQueue(readScenario(req)), { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("[admin/queue GET]", err);
    return NextResponse.json({ code: "SERVER_ERROR" }, { status: 500 });
  }
}

/** PATCH /api/admin/queue {id, action:'prioritize'} → {id, appQueuePos} · 409 NOT_QUEUED (only app-queued rows can move; TorBox has no priority API). */
export async function PATCH(req: Request) {
  const me = await requireAdminApi();
  if (me instanceof NextResponse) return me;
  const body = await parseJsonBody(req, patchSchema);
  if (body instanceof NextResponse) return body;
  try {
    const job = prioritizeJob(body.id);
    if (!job) return NextResponse.json({ code: "NOT_QUEUED" }, { status: 409 });
    return NextResponse.json({ id: job.id, appQueuePos: job.appQueuePos });
  } catch (err) {
    console.error("[admin/queue PATCH]", err);
    return NextResponse.json({ code: "SERVER_ERROR" }, { status: 500 });
  }
}
