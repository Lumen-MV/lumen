/**
 * Pure playback-progress rules (phase-04): completion threshold, "Tiếp tục xem" eligibility, resume prompt rules,
 * percent rounding. No I/O so the heartbeat route, the continue list and the player share one truth.
 */
export const COMPLETED_RATIO = 0.92;
export const RESUME_MIN_S = 30;
export const RESUME_MAX_RATIO = 0.95;
export const HEARTBEAT_MS = 10_000;
export const NEXT_EPISODE_RATIO = 0.95;

export const isCompleted = (positionS: number, durationS: number): boolean => durationS > 0 && positionS / durationS >= COMPLETED_RATIO;

export const percentOf = (positionS: number, durationS: number): number => (durationS > 0 ? Math.max(0, Math.min(100, Math.round((positionS / durationS) * 100))) : 0);

/** A row belongs in "Tiếp tục xem" when it is not completed and the viewer got past the first 30 s. */
export const continueEligible = (row: { positionS: number; durationS: number; completed: boolean }): boolean => !row.completed && row.positionS > RESUME_MIN_S && (row.durationS <= 0 || row.positionS / row.durationS < RESUME_MAX_RATIO);

/** Resume data is offered when 30 s < pos < 95 % of the duration (the player decides prompt vs silent seek). */
export const resumeOffered = (positionS: number, durationS: number): boolean => positionS > RESUME_MIN_S && durationS > 0 && positionS / durationS < RESUME_MAX_RATIO;

/** Prompt only with the pref on and not arriving from a continue card (`?resume=1`) or a QR deep link (`?t=`). */
export function shouldPromptResume(input: { resume: boolean; askResume: boolean; fromContinue: boolean; hasSeekParam: boolean }): boolean {
  return input.resume && input.askResume && !input.fromContinue && !input.hasSeekParam;
}

/** Next-episode card threshold (tv only): ≥ 95 % or ended. */
export const nextEpisodeDue = (positionS: number, durationS: number, ended: boolean): boolean => ended || (durationS > 0 && positionS / durationS >= NEXT_EPISODE_RATIO);
