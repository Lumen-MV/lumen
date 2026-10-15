import { listContinue } from "@/lib/progress/continue-list";
import { ContinueWatchingRow } from "./continue-watching-row";

/**
 * Server component streamed behind `<Suspense>` on the home page: the TMDB title/backdrop enrichment of the continue
 * rows (cold cache = up to 20 detail fetches) never delays the page shell. The page only mounts it when progress rows
 * exist (`continueRows`, a cheap SQLite read), so first-time users get no skeleton flash.
 */
export async function ContinueWatchingSection({ userId, seeAllHref }: { userId: number; seeAllHref: string }) {
  const items = await listContinue(userId).catch((err: unknown) => {
    console.warn("[home] continue row failed", err instanceof Error ? err.message : err);
    return [];
  });
  return items.length > 0 ? <ContinueWatchingRow items={items} seeAllHref={seeAllHref} /> : null;
}
