import { describe, expect, it } from "vitest";
import { isVideoFile, pickVideoFile } from "@/lib/torbox/torbox-pick-video-file";

/** Season-pack file picking must never fall back to "the largest file" for a specific episode (fix round 1, P1-4 / D4). */
const GB = 1024 ** 3;
// Stranger Things S01-05 pack, MIRCrew-style Italian naming (`S04x09`), the shape that produced the wrong-episode row
const STRANGER_PACK = [
  { id: 0, name: "Stranger Things S01-05 ITA ENG 1080p/Stagione 4/Stranger Things - S04x01 - Capitolo uno Il club Hellfire.mkv", size: 3.1 * GB },
  { id: 1, name: "Stranger Things S01-05 ITA ENG 1080p/Stagione 4/Stranger Things - S04x02 - Capitolo due La maledizione di Vecna.mkv", size: 2.9 * GB },
  { id: 2, name: "Stranger Things S01-05 ITA ENG 1080p/Stagione 4/Stranger Things - S04x09 - Capitolo nove Il piano.mkv", size: 6.4 * GB },
  { id: 3, name: "Stranger Things S01-05 ITA ENG 1080p/Stagione 3/Stranger Things - S03x01 - Capitolo uno.mkv", size: 2.2 * GB },
  { id: 4, name: "Stranger Things S01-05 ITA ENG 1080p/Stagione 4/Sample/Stranger Things - S04x01 - sample.mkv", size: 0.2 * GB },
  { id: 5, name: "Stranger Things S01-05 ITA ENG 1080p/Stagione 4/Stranger Things - S04x01 - Capitolo uno.srt", size: 90_000 },
];

describe("pickVideoFile (packs)", () => {
  it("S04x09-style names resolve the requested episode, never the largest file", () => {
    expect(pickVideoFile(STRANGER_PACK, 4, 1)?.id).toBe(0);
    expect(pickVideoFile(STRANGER_PACK, 4, 2)?.id).toBe(1);
    expect(pickVideoFile(STRANGER_PACK, 4, 9)?.id).toBe(2);
    expect(pickVideoFile(STRANGER_PACK, 3, 1)?.id).toBe(3);
  });
  it("episode not in the pack (partial pack) → null, not the largest file", () => {
    expect(pickVideoFile(STRANGER_PACK, 4, 5)).toBeNull();
    expect(pickVideoFile(STRANGER_PACK, 2, 1)).toBeNull();
  });
  it("accepts S04E09, S04.E09, 4x09, 04x09, E09 / Episode 9 inside a season folder", () => {
    const one = (name: string) => [{ id: 7, name, size: 2 * GB }];
    expect(pickVideoFile(one("Show.S04E09.1080p.WEB.x264-GRP.mkv"), 4, 9)?.id).toBe(7);
    expect(pickVideoFile(one("Show.S04.E09.1080p.mkv"), 4, 9)?.id).toBe(7);
    expect(pickVideoFile(one("Show - 4x09 - Title.mkv"), 4, 9)?.id).toBe(7);
    expect(pickVideoFile(one("Show - 04x09.mkv"), 4, 9)?.id).toBe(7);
    expect(pickVideoFile(one("Show/Season 4/Show.E09.mkv"), 4, 9)?.id).toBe(7);
    expect(pickVideoFile(one("Show/Season 04/Episode 9.mkv"), 4, 9)?.id).toBe(7);
    expect(pickVideoFile(one("Show S04/Show.Ep.09.mkv"), 4, 9)?.id).toBe(7);
  });
  it("a bare E09 without any season context is not confident → null; wrong season folder → null", () => {
    expect(pickVideoFile([{ id: 1, name: "Show.E09.mkv", size: 2 * GB }], 4, 9)).toBeNull();
    expect(pickVideoFile([{ id: 1, name: "Show/Season 3/Show.E09.mkv", size: 2 * GB }], 4, 9)).toBeNull();
  });
  it("episode digits must end cleanly: E1 does not match E10/E11; S04E09 does not match S04E090", () => {
    const files = [
      { id: 10, name: "Show.S01E10.mkv", size: 2 * GB },
      { id: 11, name: "Show.S01E11.mkv", size: 2 * GB },
    ];
    expect(pickVideoFile(files, 1, 1)).toBeNull();
    expect(pickVideoFile(files, 1, 10)?.id).toBe(10);
  });
  it("duplicates of the same episode → the largest; samples / subtitles never win", () => {
    const files = [
      { id: 1, name: "Show.S02E03.720p.mkv", size: 1 * GB },
      { id: 2, name: "Show.S02E03.1080p.mkv", size: 3 * GB },
      { id: 3, name: "Show.S02E03.sample.mkv", size: 0.5 * GB },
    ];
    expect(pickVideoFile(files, 2, 3)?.id).toBe(2);
    expect(isVideoFile("a.srt")).toBe(false);
    expect(isVideoFile("a.sample.mkv")).toBe(false);
  });
  it("movies (no S/E) still take the largest video ≥ 100 MB", () => {
    expect(pickVideoFile([{ id: 1, name: "a.mp4", size: 3 * GB }, { id: 2, name: "b.mkv", size: 5 * GB }, { id: 3, name: "c.txt", size: 9 * GB }])?.id).toBe(2);
  });
});
