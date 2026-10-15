import type { SubTrack } from "./subtitle-types";

/**
 * Which track plays when the player opens: the one last used for this title → the `sub_lang` preference
 * (vi: human vi → AI vi → OS machine-translated vi (only when nothing else Vietnamese exists), else "Tắt" — a
 * Vietnamese viewer is never auto-switched to English, mockup `popover-none`; en: en → human vi → AI vi → MT vi;
 * off: nothing). Locked tracks (OS quota) are never auto-picked. `selectedSubId === 0` means the viewer chose "Tắt".
 */
const isViHuman = (t: SubTrack) => t.lang === "vi" && !t.ai && t.source !== "os_mt";
const isViMt = (t: SubTrack) => t.lang === "vi" && t.source === "os_mt";

export function autoSelectTrack(tracks: SubTrack[], selectedSubId: number | null, subLang: "vi" | "en" | "off"): number | null {
  if (selectedSubId === 0) return null;
  const usable = tracks.filter((t) => !t.locked);
  if (selectedSubId !== null) {
    const last = usable.find((t) => t.id === selectedSubId);
    if (last) return last.id;
  }
  if (subLang === "off") return null;
  const viHuman = usable.find(isViHuman);
  const viAi = usable.find((t) => t.lang === "vi" && t.ai);
  const viMt = usable.find(isViMt);
  const en = usable.find((t) => t.lang === "en");
  const order = subLang === "vi" ? [viHuman, viAi, viMt] : [en, viHuman, viAi, viMt];
  return order.find((t) => t !== undefined)?.id ?? null;
}

/** `C` key: Tắt → vi… → vi AI → vi MT → en… → others → Tắt (locked tracks skipped). */
export function nextCycleTrack(tracks: SubTrack[], currentId: number | null): number | null {
  const order = tracks.filter((t) => !t.locked).sort((a, b) => rank(a) - rank(b));
  if (!order.length) return null;
  const i = currentId === null ? -1 : order.findIndex((t) => t.id === currentId);
  if (i === -1 && currentId !== null) return null;
  return i + 1 < order.length ? order[i + 1].id : null;
}
const rank = (t: SubTrack) => (t.lang === "vi" ? (t.ai ? 1 : isViMt(t) ? 2 : 0) : t.lang === "en" ? 3 : 4);

/** The English source a translation would use (first unlocked en track). */
export const englishSource = (tracks: SubTrack[]): SubTrack | null => tracks.find((t) => t.lang === "en" && !t.locked) ?? null;

/** The ＋ AI row is offered while no human / AI Vietnamese track is usable (a machine-translated OS file is only a fallback). */
export const canOfferAiTranslate = (tracks: SubTrack[]): boolean => !tracks.some((t) => t.lang === "vi" && !t.locked && t.source !== "os_mt") && englishSource(tracks) !== null;

/**
 * Onboarding pref "Tự dịch bằng AI khi không có bản Việt" (default OFF): start the job without a click only when the
 * pref is on, NO Vietnamese track exists at all — a locked (quota) OS vi shows the quota state instead of paying, a
 * machine-translated vi is the free fallback — an English one does, and no job is already running / just failed.
 */
export function shouldAutoTranslate(input: { autoTranslate: boolean; tracks: SubTrack[]; jobState: "idle" | "running" | "error" }): boolean {
  if (!input.autoTranslate || input.jobState !== "idle") return false;
  if (input.tracks.some((t) => t.lang === "vi")) return false;
  return englishSource(input.tracks) !== null;
}
