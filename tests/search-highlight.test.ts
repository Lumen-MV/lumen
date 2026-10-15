import { describe, expect, it } from "vitest";
import { highlightMatch, stripDiacritics } from "@/lib/tmdb/search-highlight";

describe("search highlight", () => {
  it("strips Vietnamese diacritics (incl. đ)", () => {
    expect(stripDiacritics("Người Nhện: Không Còn Nhà")).toBe("Nguoi Nhen: Khong Con Nha");
    expect(stripDiacritics("Đi Tìm Nemo")).toBe("Di Tim Nemo");
  });

  it("marks the matched part case/diacritic-insensitively, keeping the original text", () => {
    expect(highlightMatch("Người Nhện: Không Còn Nhà", "nguoi nhen")).toEqual([
      { text: "Người Nhện", match: true },
      { text: ": Không Còn Nhà", match: false },
    ]);
    expect(highlightMatch("Deadpool & Wolverine", "WOLV")).toEqual([
      { text: "Deadpool & ", match: false },
      { text: "Wolv", match: true },
      { text: "erine", match: false },
    ]);
  });

  it("returns one plain segment when nothing matches or the query is empty", () => {
    expect(highlightMatch("Arcane", "spider")).toEqual([{ text: "Arcane", match: false }]);
    expect(highlightMatch("Arcane", "   ")).toEqual([{ text: "Arcane", match: false }]);
    expect(highlightMatch("", "a")).toEqual([{ text: "", match: false }]);
  });
});
