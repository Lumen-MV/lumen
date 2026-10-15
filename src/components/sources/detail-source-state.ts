import { copy } from "@/lib/copy-vi";
import { shortContainer } from "@/lib/sources/release-labels";
import { primaryRelease } from "@/lib/sources/release-pref-select";
import type { Release, SourcesResponse } from "@/lib/sources/sources-types";

/**
 * Pure mapping of a sources answer to the detail hero's primary / facts / "Nguồn tốt nhất" state (phase-03 state table).
 * The primary follows the viewer's applied "Lần trước" release when there is one, else `best` (release-pref-select.ts).
 * `down` = TorBox unreachable: the hero stays neutral (no cache marker) and the primary opens the picker.
 */
export type DetailSourceState = "loading" | "direct" | "maybe" | "app" | "uncached" | "none" | "down";

export function detailSourceState(status: "loading" | "ready" | "error", data: SourcesResponse | null): DetailSourceState {
  if (status === "loading") return "loading";
  const primary = primaryRelease(data);
  if (!primary) return "none";
  if (data?.state === "torbox-down") return "down";
  if (primary.cacheState !== "cached") return "uncached";
  return primary.playClass;
}

/** "1080p MP4 · 2.7 GB · YTS" (+ " (chưa cache)" / " (cần app)") — kv "Nguồn tốt nhất" */
export function bestSourceText(state: DetailSourceState, best: Release | null): string {
  const d = copy.detailSource;
  if (state === "loading") return d.bestLoading;
  if (!best || state === "none") return d.bestNone;
  const base = d.best(best.qualityLabel, shortContainer(best.parsed), best.sizeLabel, best.parsed.group);
  if (state === "uncached") return base + d.bestUncached;
  if (state === "app") return base + d.bestApp;
  if (state === "down") return base + d.bestDown;
  return base;
}

export function primaryLabel(state: DetailSourceState, best: Release | null): string {
  const d = copy.detailSource;
  const q = best?.qualityLabel ?? "";
  switch (state) {
    case "loading":
      return d.searching;
    case "none":
      return d.none;
    case "uncached":
      return d.cloudQ(q);
    case "app":
      return d.appQ(q);
    case "down":
      return d.down;
    default:
      return d.playQ(q);
  }
}

export function factsText(state: DetailSourceState, best: Release | null): { text: string; tone: "green" | "grey" | "amber" } {
  const d = copy.detailSource;
  switch (state) {
    case "loading":
      return { text: d.factsChecking, tone: "grey" };
    case "none":
      return { text: d.factsNone, tone: "grey" };
    case "uncached":
      return { text: d.factsUncached, tone: "grey" };
    case "down":
      return { text: d.factsDown, tone: "grey" };
    case "app":
      return { text: d.factsApp(best?.playReason || best?.formatLabel || ""), tone: "amber" };
    default:
      return { text: d.factsDirect, tone: "green" };
  }
}
