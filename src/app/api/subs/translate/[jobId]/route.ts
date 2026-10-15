import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/require-admin";
import { canReadJob, getJob, toStatusDto } from "@/lib/translate/translate-job-registry";

export const dynamic = "force-dynamic";

/** GET /api/subs/translate/[jobId] → {jobId, percent, state, subId?, errorMsg?} (own or attached jobs; polled every 1 s). */
export async function GET(_req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const me = await requireUserApi();
  if (me instanceof NextResponse) return me;
  const { jobId } = await params;
  if (!/^[0-9a-f]{16}$/.test(jobId)) return NextResponse.json({ code: "BAD_REQUEST", issues: ["jobId"] }, { status: 400 });
  const job = getJob(jobId);
  if (!job || !canReadJob(job, me.user.id)) return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json(toStatusDto(job), { headers: { "cache-control": "no-store" } });
}
