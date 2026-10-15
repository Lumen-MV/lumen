import { describe, expect, it } from "vitest";
import { continueEligible, isCompleted, nextEpisodeDue, percentOf, resumeOffered, shouldPromptResume } from "@/lib/progress/progress-rules";
import { episodeAfter, episodeMap, lastCompleted, seriesPrimary, watchedCounts, type EpisodeProgressRow, type SeasonInfo } from "@/lib/progress/series-progress-rules";

/** Progress rules (92 % completed, 30 s … 95 % resume window, prompt rules) + series hero primary logic (spec phase-04). */
describe("progress rules", () => {
  it("completed at ≥ 92 %, percent rounds, continue window 30 s … 95 %", () => {
    expect(isCompleted(91.9, 100)).toBe(false);
    expect(isCompleted(92, 100)).toBe(true);
    expect(isCompleted(10, 0)).toBe(false);
    expect(percentOf(3672, 8900)).toBe(41);
    expect(continueEligible({ positionS: 29, durationS: 1000, completed: false })).toBe(false);
    expect(continueEligible({ positionS: 120, durationS: 1000, completed: false })).toBe(true);
    expect(continueEligible({ positionS: 960, durationS: 1000, completed: false })).toBe(false);
    expect(continueEligible({ positionS: 120, durationS: 1000, completed: true })).toBe(false);
    expect(resumeOffered(31, 100)).toBe(true);
    expect(resumeOffered(95, 100)).toBe(false);
  });
  it("prompt only with the pref on and not from a continue card / ?t=", () => {
    expect(shouldPromptResume({ resume: true, askResume: true, fromContinue: false, hasSeekParam: false })).toBe(true);
    expect(shouldPromptResume({ resume: true, askResume: false, fromContinue: false, hasSeekParam: false })).toBe(false);
    expect(shouldPromptResume({ resume: true, askResume: true, fromContinue: true, hasSeekParam: false })).toBe(false);
    expect(shouldPromptResume({ resume: true, askResume: true, fromContinue: false, hasSeekParam: true })).toBe(false);
    expect(shouldPromptResume({ resume: false, askResume: true, fromContinue: false, hasSeekParam: false })).toBe(false);
  });
  it("next-episode card at 95 % or ended", () => {
    expect(nextEpisodeDue(94, 100, false)).toBe(false);
    expect(nextEpisodeDue(95, 100, false)).toBe(true);
    expect(nextEpisodeDue(0, 0, true)).toBe(true);
  });
});

const seasons: SeasonInfo[] = [{ n: 1, episodeCount: 8, unairedCount: 0 }, { n: 2, episodeCount: 9, unairedCount: 0 }, { n: 3, episodeCount: 8, unairedCount: 0 }, { n: 4, episodeCount: 9, unairedCount: 0 }, { n: 5, episodeCount: 8, unairedCount: 2 }];
const row = (season: number, episode: number, pct: number, completed: boolean, at: number): EpisodeProgressRow => ({ season, episode, positionS: pct * 60, durationS: 6000, completed, updatedAt: at });

describe("series primary", () => {
  it("fresh → Phát S1 T1", () => {
    expect(seriesPrimary([], seasons)).toMatchObject({ kind: "first", season: 1, episode: 1 });
  });
  it("in-progress latest row → Tiếp tục S4 T1 with position + percent", () => {
    const p = seriesPrimary([row(4, 1, 12, false, 10), row(3, 8, 100, true, 5)], seasons);
    expect(p).toMatchObject({ kind: "continue", season: 4, episode: 1, positionS: 720, percent: 12 });
  });
  it("latest completed → Phát tập tiếp (the episode right after it), season rollover uses the aired list", () => {
    expect(seriesPrimary([row(4, 1, 100, true, 10)], seasons)).toMatchObject({ kind: "next", season: 4, episode: 2 });
    expect(seriesPrimary([row(4, 9, 100, true, 10)], seasons)).toMatchObject({ kind: "next", season: 5, episode: 1 });
    expect(seriesPrimary([row(4, 9, 100, true, 10)], seasons, { 5: [] })).toMatchObject({ kind: "next", season: 1, episode: 1 });
    expect(episodeAfter(seasons, { 4: [1, 2, 3] }, 4, 3)).toEqual({ season: 5, episode: 1 });
  });
  it("next episode already watched → first unwatched; everything aired watched → Xem lại S1 T1", () => {
    const rows: EpisodeProgressRow[] = [];
    let t = 0;
    for (const s of seasons) for (let e = 1; e <= s.episodeCount - s.unairedCount; e++) rows.push(row(s.n, e, 100, true, ++t));
    expect(seriesPrimary(rows, seasons)).toMatchObject({ kind: "replay", season: 1, episode: 1 });
    const gap = rows.filter((r) => !(r.season === 2 && r.episode === 3));
    const latestIsS4E1 = gap.map((r) => (r.season === 4 && r.episode === 1 ? { ...r, updatedAt: 999 } : r));
    expect(seriesPrimary(latestIsS4E1, seasons)).toMatchObject({ kind: "next", season: 2, episode: 3 });
  });
  it("episode map, watched counts, last completed", () => {
    const rows = [row(4, 1, 100, true, 10), row(4, 2, 40, false, 11)];
    expect(episodeMap(rows)["4:1"]).toEqual({ percent: 100, completed: true, positionS: 6000 });
    expect(episodeMap(rows)["4:2"].percent).toBe(40);
    expect(watchedCounts(rows)).toEqual({ 4: 1 });
    expect(lastCompleted(rows)).toEqual({ season: 4, episode: 1 });
    expect(lastCompleted([])).toBeNull();
  });
});
