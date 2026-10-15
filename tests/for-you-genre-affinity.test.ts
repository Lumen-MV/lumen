import { describe, expect, it } from "vitest";
import { genresOrParam, topGenreIds } from "@/lib/catalog/for-you";

describe("for-you genre affinity", () => {
  it("returns the two most frequent genre ids (duplicates inside one title count once)", () => {
    const lists = [
      [28, 12, 878],
      [28, 16],
      [16, 10751, 28],
      [16, 16, 16],
    ];
    // 28 ×3, 16 ×3 (the triple-16 title counts once), 12 ×1
    expect(topGenreIds(lists)).toEqual([28, 16]);
  });

  it("breaks ties by first appearance and respects n", () => {
    expect(topGenreIds([[18], [35], [18, 35], [99]], 2)).toEqual([18, 35]);
    expect(topGenreIds([[18], [35], [99]], 1)).toEqual([18]);
  });

  it("handles no seeds → empty → caller falls back to /movie/popular", () => {
    expect(topGenreIds([])).toEqual([]);
    expect(genresOrParam([])).toBeUndefined();
    expect(genresOrParam([28, 12])).toBe("28|12");
  });
});
