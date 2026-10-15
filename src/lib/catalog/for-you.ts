/**
 * "Dành riêng cho bạn" genre affinity (pure, unit-tested): count genre ids across the user's seed titles
 * (likes ∪ my_list ∪ progress) and keep the top N. Ties resolve by first appearance so results are stable.
 * The caller discovers movies with `with_genres=a|b` (OR) and falls back to /movie/popular when empty.
 */
export function topGenreIds(genreLists: number[][], n = 2): number[] {
  const counts = new Map<number, number>();
  for (const list of genreLists) for (const id of new Set(list)) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([id]) => id);
}

/** TMDB discover `with_genres` value for an OR of genres ("28|12"). */
export const genresOrParam = (ids: number[]): string | undefined => (ids.length ? ids.join("|") : undefined);
