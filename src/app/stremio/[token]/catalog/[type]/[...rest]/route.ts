import { NextResponse } from "next/server";
import { buildCatalog } from "@/lib/stremio/stremio-catalog-builder";
import { splitCatalogPath } from "@/lib/stremio/stremio-ids";
import { isCatalogId } from "@/lib/stremio/stremio-manifest";
import { isStremioType, stremioDevice, stremioJson, stremioNotFound, stremioOptions } from "@/lib/stremio/stremio-route-helpers";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ token: string; type: string; rest: string[] }> };

/** GET /stremio/[token]/catalog/{movie|series}/{catalogId}[/skip=N].json → {metas} · 400 on malformed percent-encoding */
export async function GET(_req: Request, ctx: Ctx) {
  const { token, type, rest } = await ctx.params;
  const device = stremioDevice(token);
  if (device instanceof NextResponse) return device;
  let id: string, extra: Record<string, string>;
  try {
    ({ id, extra } = splitCatalogPath(rest));
  } catch {
    return stremioJson({ error: "bad request" }, 400);
  }
  if (!isStremioType(type) || !isCatalogId(id)) return stremioNotFound();
  try {
    const skip = Number(extra.skip ?? "0") || 0;
    return stremioJson({ metas: await buildCatalog(id, type, device.user.id, skip) });
  } catch (err) {
    console.error("[stremio/catalog]", id, err instanceof Error ? err.message : err);
    return stremioJson({ metas: [] });
  }
}

export const OPTIONS = () => stremioOptions();
