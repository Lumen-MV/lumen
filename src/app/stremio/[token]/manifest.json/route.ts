import { NextResponse } from "next/server";
import { getEnv } from "@/lib/config/env";
import { buildManifest } from "@/lib/stremio/stremio-manifest";
import { publicBaseUrl, stremioDevice, stremioJson, stremioOptions } from "@/lib/stremio/stremio-route-helpers";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ token: string }> };

/** GET /stremio/[token]/manifest.json → addon manifest (404 JSON for an unknown / revoked token). */
export async function GET(_req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const device = stremioDevice(token);
  if (device instanceof NextResponse) return device;
  try {
    return stremioJson(buildManifest({ appUrl: publicBaseUrl(), version: getEnv().APP_VERSION, tokenPrefix: token.slice(0, 6).toLowerCase() }));
  } catch (err) {
    console.error("[stremio/manifest]", err);
    return stremioJson({ error: "server" }, 500);
  }
}

export const OPTIONS = () => stremioOptions();
