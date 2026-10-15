import { describe, expect, it } from "vitest";
import { DEFAULT_AGE, mapVnCertification, movieAgeLabel, tvAgeLabel } from "@/lib/tmdb/age-rating";

const rd = (entries: Array<[string, string]>) => ({ results: entries.map(([c, cert]) => ({ iso_3166_1: c, release_dates: [{ certification: cert }] })) });
const cr = (entries: Array<[string, string]>) => ({ results: entries.map(([c, rating]) => ({ iso_3166_1: c, rating })) });

describe("age rating", () => {
  it("maps Vietnamese board labels", () => {
    expect(mapVnCertification("T18")).toBe("18+");
    expect(mapVnCertification("T16")).toBe("16+");
    expect(mapVnCertification("T13")).toBe("13+");
    expect(mapVnCertification("C")).toBe("18+");
    expect(mapVnCertification("P")).toBe("P");
    expect(mapVnCertification("weird")).toBeNull();
  });

  it("prefers the VN certification, then US (R→18+, PG-13→16+, PG→13+), else 16+", () => {
    expect(movieAgeLabel(rd([["US", "R"], ["VN", "T13"]]))).toBe("13+");
    expect(movieAgeLabel(rd([["US", "R"]]))).toBe("18+");
    expect(movieAgeLabel(rd([["US", "PG-13"]]))).toBe("16+");
    expect(movieAgeLabel(rd([["US", "PG"]]))).toBe("13+");
    expect(movieAgeLabel(rd([["US", "NR"]]))).toBe(DEFAULT_AGE);
    expect(movieAgeLabel(rd([["FR", "12"]]))).toBe(DEFAULT_AGE);
    expect(movieAgeLabel(undefined)).toBe("16+");
    // empty VN certification entries are skipped
    expect(movieAgeLabel(rd([["VN", ""], ["US", "R"]]))).toBe("18+");
  });

  it("maps TV content ratings", () => {
    expect(tvAgeLabel(cr([["US", "TV-MA"]]))).toBe("18+");
    expect(tvAgeLabel(cr([["US", "TV-14"]]))).toBe("16+");
    expect(tvAgeLabel(cr([["US", "TV-PG"]]))).toBe("13+");
    expect(tvAgeLabel(cr([["VN", "T16"], ["US", "TV-MA"]]))).toBe("16+");
    expect(tvAgeLabel(cr([]))).toBe(DEFAULT_AGE);
  });
});
