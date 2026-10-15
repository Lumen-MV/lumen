import { describe, expect, it, vi } from "vitest";
import { resolveOverview } from "@/lib/tmdb/overview-fallback";

describe("overview fallback", () => {
  it("keeps the Vietnamese overview without calling en-US", async () => {
    const en = vi.fn(async () => "English text");
    await expect(resolveOverview("Mô tả tiếng Việt", en)).resolves.toEqual({ overview: "Mô tả tiếng Việt", overviewLang: "vi" });
    expect(en).not.toHaveBeenCalled();
  });

  it("falls back to en-US and flags 'en' when vi is empty or whitespace", async () => {
    const en = vi.fn(async () => "  English text ");
    await expect(resolveOverview("   ", en)).resolves.toEqual({ overview: "English text", overviewLang: "en" });
    await expect(resolveOverview(undefined, en)).resolves.toEqual({ overview: "English text", overviewLang: "en" });
    expect(en).toHaveBeenCalledTimes(2);
  });

  it("returns an empty 'en' overview when the fallback call fails or is empty", async () => {
    await expect(resolveOverview("", async () => { throw new Error("tmdb 503"); })).resolves.toEqual({ overview: "", overviewLang: "en" });
    await expect(resolveOverview("", async () => null)).resolves.toEqual({ overview: "", overviewLang: "en" });
  });
});
