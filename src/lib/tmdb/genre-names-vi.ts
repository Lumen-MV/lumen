/**
 * TMDB genre names → the mockup's Vietnamese wording ("Hành động", "Khoa học viễn tưởng", "Giật gân").
 * TMDB `vi-VN` leaves eight TV genres in English and prefixes movie genres with "Phim …" in Title Case
 * ("Phim Khoa Học Viễn Tưởng"); a few translations differ from the approved copy ("Phim Gây Cấn").
 * The override map wins; anything else drops the "Phim " prefix and is sentence-cased. Pure (unit-tested).
 */
const OVERRIDES: Record<string, string> = {
  // tv genres TMDB does not translate
  "Action & Adventure": "Hành động & Phiêu lưu",
  "Sci-Fi & Fantasy": "Khoa học viễn tưởng & Giả tưởng",
  "War & Politics": "Chiến tranh & Chính trị",
  Kids: "Thiếu nhi",
  News: "Tin tức",
  Reality: "Thực tế",
  Soap: "Tâm lý xã hội",
  Talk: "Trò chuyện",
  // English names (en-US fallback) → mockup wording
  Action: "Hành động",
  Adventure: "Phiêu lưu",
  Animation: "Hoạt hình",
  Comedy: "Hài",
  Crime: "Hình sự",
  Documentary: "Tài liệu",
  Drama: "Chính kịch",
  Family: "Gia đình",
  Fantasy: "Giả tưởng",
  History: "Lịch sử",
  Horror: "Kinh dị",
  Music: "Nhạc kịch",
  Mystery: "Bí ẩn",
  Romance: "Lãng mạn",
  "Science Fiction": "Khoa học viễn tưởng",
  "TV Movie": "Phim truyền hình",
  Thriller: "Giật gân",
  War: "Chiến tranh",
  Western: "Viễn Tây",
  // TMDB vi-VN translations that differ from the approved copy
  "Phim Giả Tượng": "Giả tưởng",
  "Phim Gây Cấn": "Giật gân",
  "Phim Nhạc": "Nhạc kịch",
  "Phim Miền Tây": "Viễn Tây",
  "Chương Trình Truyền Hình": "Phim truyền hình",
};

const BY_LOWER = new Map(Object.entries(OVERRIDES).map(([k, v]) => [k.toLowerCase(), v]));

const sentenceCase = (s: string) => (s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s);

/** "Phim Bí Ẩn" → "Bí ẩn", "Sci-Fi & Fantasy" → "Khoa học viễn tưởng & Giả tưởng", "Anime" → "Anime". */
export function genreNameVi(raw: string): string {
  const name = raw.trim().replace(/\s+/g, " ");
  const hit = BY_LOWER.get(name.toLowerCase());
  if (hit) return hit;
  return sentenceCase(name.replace(/^phim\s+/i, ""));
}
