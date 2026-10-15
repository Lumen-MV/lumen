import { NextResponse } from "next/server";
import { validateInvite } from "@/lib/invites/invite-service";

/** GET /api/invites/[token] → {state:'valid',inviterName,daysLeft} | {state:'used',usedBy,usedAt} | {state:'expired',expiredDaysAgo} | {state:'invalid'} */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params;
    return NextResponse.json(validateInvite(token));
  } catch (err) {
    console.error("[invites/validate]", err);
    return NextResponse.json({ code: "SERVER_ERROR" }, { status: 500 });
  }
}
