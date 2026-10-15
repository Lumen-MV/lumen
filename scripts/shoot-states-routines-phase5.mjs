// Phase 5 (Âm thanh | Phụ đề popover) routines for scripts/shoot-states.mjs, keyed `page:state`. Every state plays the
// LOCAL ffmpeg sample with the subtitle sim (`subs-sim=<state>` → deterministic subtitle_cache rows, fake translator:
// no OpenSubtitles / SubDL / Kie traffic); `os-quota-zero` and `kie-down` ride along for the quota / failed states.
import { playing } from "./shoot-states-routines-phase4.mjs";

const MOVIE = "movie:634649";

export const SETUPS = {
  /** wipe + reseed the sim rows / prefs / jobs of the sample title so each state starts from the same rows */
  "subs:seed": (api) => api.seed({ fixture: "subs", mediaKey: MOVIE }),
};

/** The controls auto-hide 3 s after the last pointer move; a move to the SAME point fires no event, so wiggle first. */
const wakeControls = async (c) => {
  await c.page.mouse.move(690, 390);
  await c.page.mouse.move(700, 400);
};

/** `band`: wait for the vi cue in the band first (states whose auto-selected track renders one). */
async function popover(c, band = false) {
  await playing(c);
  if (band) await c.page.waitForSelector(".subs span", { timeout: 10000 });
  await wakeControls(c); // controls may have auto-hidden meanwhile (slow first VTT fetch on a cold dev server)
  await c.page.waitForSelector('.player[data-controls="visible"]');
  await c.page.click('[data-action="cc"]');
  await c.page.waitForSelector('.pop [data-col="subs"] .it');
  await c.page.mouse.move(700, 300); // keep the hover colour off the rows
}

export const ROUTINES = {
  // Phase 4 `default` / `controls-hidden` are completed by the band + source line: wait for the cue before the shot
  "player:default": async (c) => {
    await playing(c);
    await c.page.waitForSelector(".subs span", { timeout: 10000 });
    await wakeControls(c);
    await c.page.waitForSelector('.player[data-controls="visible"] .sub-src', { state: "attached" }); // hidden by CSS ≤ 700 px
  },
  "player:controls-hidden": async (c) => {
    await playing(c);
    await c.page.waitForSelector(".subs span", { timeout: 10000 });
    await c.page.mouse.move(5, 5);
    await c.page.waitForSelector('.player[data-controls="hidden"]', { timeout: 6000 });
  },
  "player:popover": async (c) => {
    await popover(c, true);
    await c.page.waitForSelector('.pop [data-track].on[data-lang="vi"]');
  },
  "player:popover-ai": async (c) => {
    await popover(c, true);
    await c.page.click('.pop [data-source="ai"]');
    await c.page.waitForSelector(".subs.ai span");
    await c.page.mouse.move(700, 300);
  },
  "player:popover-translating": async (c) => {
    await popover(c);
    await c.page.click('[data-action="translate"]');
    await c.page.waitForSelector('[data-translate="running"] .mini');
    await c.page.waitForFunction(() => /42%/.test(document.querySelector('[data-translate="running"]')?.textContent ?? ""));
    await c.page.mouse.move(700, 300);
  },
  "player:popover-none": async (c) => {
    await popover(c);
    await c.page.waitForSelector('[data-translate="idle"] small');
  },
  "player:popover-none-en": async (c) => {
    await popover(c);
    await c.page.waitForSelector("[data-none-note]");
  },
  "player:popover-quota": async (c) => {
    await popover(c);
    await c.page.waitForSelector("[data-quota-note]");
  },
  "player:popover-translate-failed": async (c) => {
    await popover(c);
    await c.page.click('[data-action="translate"]');
    await c.page.waitForSelector('[data-translate="error"]', { timeout: 15000 });
    await c.page.mouse.move(700, 300);
  },
};
