import { copy } from "@/lib/copy-vi";
import { LUMEN_PREFIX } from "./stremio-ids";

/**
 * Addon manifest (pure). Catalog ids: `lumen-trending-movie`, `lumen-trending-series`, `lumen-anime`, `lumen-my-list` (movie +
 * series). meta/catalog answer only our `lumen:` ids; stream/subtitles also answer `tt` ids so other addons' metas and the
 * hand-off deep link get our TorBox streams. `id` is per installation (device token) so Stremio treats each as its own addon.
 */
export const CATALOG_IDS = { trendingMovie: "lumen-trending-movie", trendingSeries: "lumen-trending-series", anime: "lumen-anime", myList: "lumen-my-list" } as const;
export type CatalogId = (typeof CATALOG_IDS)[keyof typeof CATALOG_IDS];
export const isCatalogId = (id: string): id is CatalogId => (Object.values(CATALOG_IDS) as string[]).includes(id);

export type StremioManifest = {
  id: string;
  version: string;
  name: string;
  description: string;
  logo: string;
  resources: Array<string | { name: string; types: string[]; idPrefixes: string[] }>;
  types: string[];
  idPrefixes: string[];
  catalogs: Array<{ type: string; id: string; name: string; extra?: Array<{ name: string; isRequired?: boolean }> }>;
  behaviorHints: { configurable: boolean; configurationRequired: boolean };
};

export function buildManifest(input: { appUrl: string; version: string; tokenPrefix: string }): StremioManifest {
  const c = copy.stremio.catalogs;
  return {
    id: `vn.lumen.${input.tokenPrefix}`,
    version: /^\d+\.\d+\.\d+$/.test(input.version) ? input.version : `${input.version}.0`.replace(/^(\d+\.\d+)\.0$/, "$1.0"),
    name: copy.stremio.name,
    description: copy.stremio.description,
    logo: `${input.appUrl}/icons/icon-512.png`,
    resources: ["catalog", "meta", { name: "stream", types: ["movie", "series"], idPrefixes: [LUMEN_PREFIX, "tt"] }, { name: "subtitles", types: ["movie", "series"], idPrefixes: [LUMEN_PREFIX, "tt"] }],
    types: ["movie", "series"],
    idPrefixes: [LUMEN_PREFIX],
    catalogs: [
      { type: "movie", id: CATALOG_IDS.trendingMovie, name: c.trendingMovie, extra: [{ name: "skip" }] },
      { type: "series", id: CATALOG_IDS.trendingSeries, name: c.trendingSeries, extra: [{ name: "skip" }] },
      { type: "series", id: CATALOG_IDS.anime, name: c.anime, extra: [{ name: "skip" }] },
      { type: "movie", id: CATALOG_IDS.myList, name: c.myList, extra: [{ name: "skip" }] },
      { type: "series", id: CATALOG_IDS.myList, name: c.myList, extra: [{ name: "skip" }] },
    ],
    behaviorHints: { configurable: false, configurationRequired: false },
  };
}
