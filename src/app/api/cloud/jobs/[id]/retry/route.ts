import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/require-admin";
import { getJob, toCloudJob } from "@/lib/cloud/cloud-jobs-store";
import { retryJob } from "@/lib/cloud/cloud-queue";
import { parsePositiveInt } from "@/lib/http/catalog-route-helpers";
import { sourcesErrorResponse } from "@/lib/http/sources-route-helpers";

/** POST /api/cloud/jobs/[id]/retry → CloudJob (an `error` job is re-added to TorBox; others answer 409). */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await requireUserApi();
  if (me instanceof NextResponse) return me;
  const id = parsePositiveInt((await ctx.params).id);
  if (id === null) return NextResponse.json({ code: "BAD_REQUEST", issues: ["id"] }, { status: 400 });
  const job = getJob(id);
  if (!job) return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
  if (job.userId !== me.user.id && me.user.role !== "admin") return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });
  if (job.state !== "error") return NextResponse.json({ code: "NOT_RETRYABLE", state: job.state }, { status: 409 });
  try {
    return NextResponse.json(toCloudJob(await retryJob(job)));
  } catch (err) {
    return sourcesErrorResponse("cloud/jobs/retry", err);
  }
}
