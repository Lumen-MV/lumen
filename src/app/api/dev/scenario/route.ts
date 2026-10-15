import { NextResponse } from "next/server";
import { z } from "zod";
import { devScenariosEnabled } from "@/lib/config/env";
import { parseJsonBody } from "@/lib/http/parse-json-body";
import { SCENARIO_COOKIE } from "@/lib/auth/session-config";
import { SCENARIO_ENTRY_RE, SCENARIO_FLAGS } from "@/lib/dev/scenario-flags";

/** Entries are `flag` or `flag=param` (e.g. `cloud-sim=downloading:60:20`). */
const bodySchema = z.object({ flags: z.array(z.string().regex(SCENARIO_ENTRY_RE)).max(SCENARIO_FLAGS.length) });

/** POST /api/dev/scenario {flags[]} → sets the lumen_scenario cookie (not httpOnly so client components can read it). 404 unless LUMEN_SCENARIOS=1. */
export async function POST(req: Request) {
  if (!devScenariosEnabled()) return new NextResponse(null, { status: 404 });
  const body = await parseJsonBody(req, bodySchema);
  if (body instanceof NextResponse) return body;
  const res = NextResponse.json({ flags: body.flags });
  res.cookies.set(SCENARIO_COOKIE, body.flags.join(","), { httpOnly: false, sameSite: "lax", path: "/", maxAge: body.flags.length ? 60 * 60 : 0 });
  return res;
}
