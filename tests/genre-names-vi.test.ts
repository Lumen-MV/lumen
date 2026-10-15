import { describe, expect, it } from "vitest";
import { genreNameVi } from "@/lib/tmdb/genre-names-vi";

describe("genreNameVi", () => {
  it("translates the TV genres TMDB leaves in English", () => {
    expect(genreNameVi("Action & Adventure")).toBe("Hành động & Phiêu lưu");
    expect(genreNameVi("Sci-Fi & Fantasy")).toBe("Khoa học viễn tưởng & Giả tưởng");
    expect(genreNameVi("War & Politics")).toBe("Chiến tranh & Chính trị");
    expect(genreNameVi("Kids")).toBe("Thiếu nhi");
    expect(genreNameVi("News")).toBe("Tin tức");
    expect(genreNameVi("Reality")).toBe("Thực tế");
    expect(genreNameVi("Soap")).toBe("Tâm lý xã hội");
    expect(genreNameVi("Talk")).toBe("Trò chuyện");
  });

  it("maps en-US names and odd vi translations to the mockup wording", () => {
    expect(genreNameVi("Mystery")).toBe("Bí ẩn");
    expect(genreNameVi("Western")).toBe("Viễn Tây");
    expect(genreNameVi("Documentary")).toBe("Tài liệu");
    expect(genreNameVi("Family")).toBe("Gia đình");
    expect(genreNameVi("TV Movie")).toBe("Phim truyền hình");
    expect(genreNameVi("Thriller")).toBe("Giật gân");
    expect(genreNameVi("Phim Gây Cấn")).toBe("Giật gân");
    expect(genreNameVi("Phim Giả Tượng")).toBe("Giả tưởng");
    expect(genreNameVi("Phim Nhạc")).toBe("Nhạc kịch");
    expect(genreNameVi("Chương Trình Truyền Hình")).toBe("Phim truyền hình");
  });

  it("normalises TMDB vi Title Case 'Phim …' names to sentence case without the prefix", () => {
    expect(genreNameVi("Phim Bí Ẩn")).toBe("Bí ẩn");
    expect(genreNameVi("Phim Hài")).toBe("Hài");
    expect(genreNameVi("Phim Khoa Học Viễn Tưởng")).toBe("Khoa học viễn tưởng");
    expect(genreNameVi("Phim Hoạt Hình")).toBe("Hoạt hình");
    expect(genreNameVi("Phim Lãng Mạn")).toBe("Lãng mạn");
    expect(genreNameVi("  Phim   Hành   Động ")).toBe("Hành động");
  });

  it("is case-insensitive on the map and leaves plain names alone", () => {
    expect(genreNameVi("ACTION")).toBe("Hành động");
    expect(genreNameVi("Anime")).toBe("Anime");
    expect(genreNameVi("")).toBe("");
  });

  it("covers the whole mockup genre list", () => {
    const mock = ["Hành động", "Phiêu lưu", "Khoa học viễn tưởng", "Hoạt hình", "Gia đình", "Hài", "Chính kịch", "Lịch sử", "Giật gân", "Giả tưởng", "Nhạc kịch", "Kinh dị"];
    const tmdbVi = ["Phim Hành Động", "Phim Phiêu Lưu", "Phim Khoa Học Viễn Tưởng", "Phim Hoạt Hình", "Phim Gia Đình", "Phim Hài", "Phim Chính Kịch", "Phim Lịch Sử", "Phim Gây Cấn", "Phim Giả Tượng", "Phim Nhạc", "Phim Kinh Dị"];
    expect(tmdbVi.map(genreNameVi)).toEqual(mock);
  });
});
