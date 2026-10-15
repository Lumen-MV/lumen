import { NextResponse } from "next/server";
import type { ZodType } from "zod";

/** Validates a JSON request body at the boundary; returns the data or a ready 400 response. */
export async function parseJsonBody<T>(req: Request, schema: ZodType<T>): Promise<T | NextResponse> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ code: "BAD_JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ code: "BAD_REQUEST", issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }, { status: 400 });
  return parsed.data;
}
