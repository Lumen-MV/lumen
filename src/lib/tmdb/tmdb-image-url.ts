/** image.tmdb.org URL builder. Sizes per plan: card w342, wide/still w500, hero backdrop w1280, detail backdrop original, poster w500, logo w500. */
const IMG_BASE = "https://image.tmdb.org/t/p";

export const IMG_SIZE = { card: "w342", poster: "w500", still: "w500", wide: "w500", hero: "w1280", original: "original", logo: "w500", profile: "w185" } as const;
export type ImgSize = (typeof IMG_SIZE)[keyof typeof IMG_SIZE];

export function tmdbImageUrl(path: string | null | undefined, size: ImgSize): string | null {
  if (!path) return null;
  return `${IMG_BASE}/${size}${path.startsWith("/") ? path : `/${path}`}`;
}
