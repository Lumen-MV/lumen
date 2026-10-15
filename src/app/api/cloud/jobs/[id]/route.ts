import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/require-admin";
import { getJob } from "@/lib/cloud/cloud-jobs-store";
import { cancelJob } from "@/lib/cloud/cloud-queue";
import { parsePositiveInt } from "@/lib/http/catalog-route-helpers";
import { sourcesErrorResponse } from "@/lib/http/sources-route-helpers";

/** DELETE /api/cloud/jobs/[id] → 204. Only the requester (or an admin) may cancel; TorBox torrent we added is deleted. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await requireUserApi();
  if (me instanceof NextResponse) return me;
  const id = parsePositiveInt((await ctx.params).id);
  if (id === null) return NextResponse.json({ code: "BAD_REQUEST", issues: ["id"] }, { status: 400 });
  const job = getJob(id);
  if (!job) return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
  if (job.userId !== me.user.id && me.user.role !== "admin") return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });
  try {
    await cancelJob(job);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return sourcesErrorResponse("cloud/jobs/delete", err);
  }
}
