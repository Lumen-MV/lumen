import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireUserApi } from "@/lib/auth/require-admin";
import { parseJsonBody } from "@/lib/http/parse-json-body";
import { setUserSettings, userSettingsPatchSchema } from "@/lib/users/user-settings";
import { getDb, schema } from "@/lib/db/sqlite-client";

// `onboarded: true` rides along with the last onboarding step.
const bodySchema = userSettingsPatchSchema.extend({ onboarded: z.literal(true).optional() });

/** PATCH /api/me/settings {quality?, sub_lang?, auto_translate?, …, onboarded?} → {settings, onboarded} */
export async function PATCH(req: Request) {
  const me = await requireUserApi();
  if (me instanceof NextResponse) return me;
  const body = await parseJsonBody(req, bodySchema);
  if (body instanceof NextResponse) return body;
  try {
    const { onboarded, ...patch } = body;
    const settings = setUserSettings(me.user.id, patch);
    if (onboarded) getDb().update(schema.users).set({ onboarded: true }).where(eq(schema.users.id, me.user.id)).run();
    return NextResponse.json({ settings, onboarded: onboarded ?? me.user.onboarded });
  } catch (err) {
    console.error("[me/settings]", err);
    return NextResponse.json({ code: "SERVER_ERROR" }, { status: 500 });
  }
}
