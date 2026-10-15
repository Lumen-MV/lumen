import type { Cue } from "./subtitle-types";

/** The mockup's sample dialogue (screen-player.js / spike subtitles-vi.js) — dev fixtures, sim rows, tests. */
export const SAMPLE_EN_CUES: Cue[] = [
  { start: 1000, end: 3500, text: "Peter, we need to talk about what happened." },
  { start: 4000, end: 6200, text: "Everyone knows who I am now." },
  { start: 6800, end: 9000, text: "There might be a way to fix this." },
  { start: 9500, end: 12_000, text: "A spell. It would make everyone forget." },
  { start: 12_500, end: 14_000, text: "Are you sure that's a good idea?" },
  { start: 14_500, end: 17_000, text: "[dramatic music]" },
];

/** Vietnamese lines; the first cue is the two-line mockup band text ("- Peter, mình cần… / - Giờ ai cũng biết…"). */
export const SAMPLE_VI_CUES: Cue[] = [
  { start: 0, end: 60_000, text: "- Peter, mình cần nói chuyện về chuyện vừa xảy ra.\n- Giờ ai cũng biết em là ai rồi." },
  { start: 60_000, end: 62_000, text: "Có thể có cách để sửa chuyện này." },
  { start: 62_500, end: 65_000, text: "Một câu thần chú. Nó sẽ khiến mọi người quên hết." },
  { start: 65_500, end: 67_000, text: "Anh chắc đây là ý hay chứ?" },
  { start: 67_500, end: 70_000, text: "[nhạc kịch tính]" },
];

/** Fake-translator dictionary (dev sim): English sample line → Vietnamese. */
export const SAMPLE_TRANSLATIONS: Record<string, string> = {
  "Peter, we need to talk about what happened.": "Peter, mình cần nói chuyện về chuyện vừa xảy ra.",
  "Everyone knows who I am now.": "Giờ ai cũng biết em là ai rồi.",
  "There might be a way to fix this.": "Có thể có cách để sửa chuyện này.",
  "A spell. It would make everyone forget.": "Một câu thần chú. Nó sẽ khiến mọi người quên hết.",
  "Are you sure that's a good idea?": "Anh chắc đây là ý hay chứ?",
  "[dramatic music]": "[nhạc kịch tính]",
};
