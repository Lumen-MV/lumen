import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/require-admin";
import type { SessionUser } from "@/lib/auth/get-session-user";
import { parseMediaKey } from "@/lib/catalog/media-key";
import { readScenario, readScenarioParams, type ScenarioFlag } from "@/lib/dev/scenario-flags";
import { getStream, type StreamEntry } from "@/lib/play/stream-registry";

/** Shared by /api/subs/*: session, scenario, optional stream handle (owner-checked), mediaKey validation. */
export type SubsRequestContext = { me: SessionUser; scenario: Set<ScenarioFlag>; params: Map<ScenarioFlag, string> };

export async function subsContext(req: Request): Promise<SubsRequestContext | NextResponse> {
  const me = await requireUserApi();
  if (me instanceof NextResponse) return me;
  return { me, scenario: readScenario(req), params: readScenarioParams(req) };
}

/** `?streamId=` is optional; when present it must be a valid handle of this user (else 410 STREAM_EXPIRED). */
export function optionalStream(req: Request, userId: number): StreamEntry | null | NextResponse {
  const raw = new URL(req.url).searchParams.get("streamId");
  if (!raw) return null;
  if (!/^[0-9a-f]{32}$/.test(raw)) return NextResponse.json({ code: "BAD_REQUEST", issues: ["streamId"] }, { status: 400 });
  return getStream(raw, userId) ?? NextResponse.json({ code: "STREAM_EXPIRED" }, { status: 410 });
}

export function validMediaKey(raw: string | null | undefined): string | NextResponse {
  return raw && parseMediaKey(raw) ? raw : NextResponse.json({ code: "BAD_REQUEST", issues: ["mediaKey"] }, { status: 400 });
}

export function subsErrorResponse(scope: string, err: unknown): NextResponse {
  console.error(`[${scope}]`, err instanceof Error ? err.message : err);
  return NextResponse.json({ code: "SERVER_ERROR" }, { status: 500 });
}
