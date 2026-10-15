import { describe, expect, it } from "vitest";
import { formatMediaKey, mediaHref, parseMediaKey } from "@/lib/catalog/media-key";

describe("media key", () => {
  it("formats title and episode keys", () => {
    expect(formatMediaKey("movie", 634649)).toBe("movie:634649");
    expect(formatMediaKey("tv", 66732)).toBe("tv:66732");
    expect(formatMediaKey("tv", 66732, 4, 1)).toBe("tv:66732:4:1");
  });

  it("parses valid keys", () => {
    expect(parseMediaKey("movie:634649")).toEqual({ type: "movie", tmdbId: 634649 });
    expect(parseMediaKey("tv:66732:4:1")).toEqual({ type: "tv", tmdbId: 66732, season: 4, episode: 1 });
    expect(parseMediaKey("tv:456")).toEqual({ type: "tv", tmdbId: 456 });
    expect(parseMediaKey("tv:1")).toEqual({ type: "tv", tmdbId: 1 });
    expect(parseMediaKey("tv:66732:0:1")).toEqual({ type: "tv", tmdbId: 66732, season: 0, episode: 1 });
  });

  it("rejects anything else", () => {
    for (const bad of ["person:1", "movie:", "movie:abc", "tv:1:2", "movie:1:2:3:4", "", 42, null, undefined, "movie:1234567890", "movie:0", "tv:0", "movie:007"]) {
      expect(parseMediaKey(bad)).toBeNull();
    }
  });

  it("builds detail hrefs", () => {
    expect(mediaHref("movie", 634649)).toBe("/movie/634649");
    expect(mediaHref("tv", 66732)).toBe("/series/66732");
    expect(mediaHref("tv", 66732, 4)).toBe("/series/66732?s=4");
  });
});
