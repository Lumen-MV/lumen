// Phase 4 (player / progress / My List) routines for scripts/shoot-states.mjs, keyed `page:state`. Every player state
// plays the LOCAL ffmpeg sample (scenario `play-sample`, resolve answers it — no TorBox traffic); failure states come from
// scenario flags (`play-sample=ac3` no-audio, `playback-fail` codec error, `link-expired[=fail]`, `offline`) and from
// holding requests. `SETUPS` seed progress / my_list / viewers rows through POST /api/dev/seed.
import { asAdmin, hold, open, sleep } from "./shoot-states-routines-phase2-helpers.mjs";

const MOVIE = "movie:634649";
const STRANGER = "tv:66732";
const pct = (mediaKey, p, extra = {}) => ({ mediaKey, positionS: p * 60, durationS: 6000, ...extra });
/** mockup "Tiếp tục xem" rows (screen-home.js `cw`, screen-my-list.js `CW`) */
const HOME_CW = [pct(MOVIE, 62), pct("tv:1399:1:4", 85), pct("movie:872585", 30), pct(`${STRANGER}:4:1`, 12), pct("tv:93405:2:3", 70), pct("movie:1022789", 48), pct("tv:94605:2:5", 20), pct("movie:157336", 55)].map((r, i) => ({ ...r, agoMs: i * 3_600_000 }));
const LIST_CW = HOME_CW.slice(0, 6);
/** my-list.html `LIST` (14 titles) */
const LIST = ["movie:693134", "tv:100088", "movie:533535", "tv:126308", "movie:402431", "movie:157336", "tv:94605", "movie:1184918", "tv:209867", "movie:558449", "movie:12", "tv:85937", "movie:1241982", "movie:438148"].map((mediaKey, i) => ({ mediaKey, daysAgo: i + 1 }));
const RESUME_ROW = { mediaKey: MOVIE, positionS: 3672, durationS: 8900, device: "iPhone", agoMs: 26 * 3_600_000 };

export const SETUPS = {
  "progress:none": (api) => api.seed({ fixture: "progress", rows: [] }),
  "progress:home": (api) => api.seed({ fixture: "progress", rows: HOME_CW }),
  "progress:resume": async (api) => {
    await api.seed({ fixture: "progress", rows: [RESUME_ROW] });
    await api.seed({ fixture: "my-list", items: [{ mediaKey: MOVIE, daysAgo: 1 }] });
  },
  "progress:series-default": (api) => api.seed({ fixture: "progress", rows: [pct(`${STRANGER}:4:1`, 12, { positionS: 760, durationS: 6333 })] }),
  "progress:series-next-ep": (api) => api.seed({ fixture: "progress", rows: [{ mediaKey: `${STRANGER}:4:1`, durationS: 4560, completed: true }] }),
  "progress:series-finished": (api) => api.seed({ fixture: "progress", rows: [{ mediaKey: STRANGER, allEpisodes: true, completed: true, durationS: 3000 }] }),
  "my-list:default": async (api) => {
    await api.seed({ fixture: "progress", rows: LIST_CW });
    await api.seed({ fixture: "my-list", items: LIST });
  },
  "my-list:empty-continue": async (api) => {
    await api.seed({ fixture: "progress", rows: [] });
    await api.seed({ fixture: "my-list", items: LIST });
  },
  "my-list:empty": async (api) => {
    await api.seed({ fixture: "progress", rows: [] });
    await api.seed({ fixture: "my-list", items: [] });
  },
  "viewers:5": (api) => api.seed({ fixture: "viewers", count: 5 }),
  "viewers:0": (api) => api.seed({ fixture: "clear-views" }),
};

const PLAYING = () => {
  const v = document.querySelector("video");
  return Boolean(v && !v.paused && v.currentTime > 0.3);
};

/** Resolves the sample stream in the page's own session and opens /watch/[id]{query}. */
async function openPlayer(c, mediaKey = MOVIE, query = "") {
  await asAdmin(c);
  const res = await c.page.request.post(`${c.api.base}/api/play/resolve`, { data: { mediaKey, auto: true } });
  if (!res.ok()) throw new Error(`resolve → ${res.status()}`);
  const { streamId } = await res.json();
  await c.page.goto(`${c.api.base}/watch/${streamId}${query}`);
  await c.page.waitForSelector(".player");
  // leaving the player sends a progress beacon: do it now, before the NEXT state's fixtures seed progress rows
  c.cleanup = async () => { await c.page.goto("about:blank"); await sleep(600); };
  return streamId;
}
const showControls = async (c) => {
  await c.page.mouse.move(700, 400);
  await sleep(250);
};
export async function playing(c, mediaKey = MOVIE, query = "") {
  await openPlayer(c, mediaKey, query);
  await c.page.waitForFunction(PLAYING, null, { timeout: 20000 });
  await showControls(c);
}
async function handoff(c) {
  await playing(c);
  await c.page.click('[data-action="cast"]');
  await c.page.waitForSelector(".sheet2");
}
/** Chromium keeps the 3 MB sample fully buffered: an "expired" link only bites when the browser re-requests it. */
const rerequestMedia = (page) => page.evaluate(() => { const v = document.querySelector("video"); v.src = v.src + "&x=1"; v.load(); });

export const ROUTINES = {
  // ---------- player ----------
  "player:default": (c) => playing(c),
  "player:controls-hidden": async (c) => {
    await playing(c);
    await c.page.mouse.move(5, 5);
    await c.page.waitForSelector('.player[data-controls="hidden"]', { timeout: 6000 });
  },
  "player:paused": async (c) => {
    await playing(c);
    await c.page.keyboard.press(" ");
    await c.page.waitForSelector('[data-action="toggle-play"][data-paused="true"]');
    await sleep(600); // centre flash fades
  },
  "player:seek-hover": async (c) => {
    await playing(c);
    const box = await (await c.page.$(".seek .trk")).boundingBox();
    await c.page.mouse.move(box.x + box.width * 0.62, box.y + 1);
    await c.page.waitForSelector("[data-seek-preview]");
  },
  "player:handoff": handoff,
  "player:handoff-sent": async (c) => {
    await handoff(c);
    await c.page.click('[data-handoff="stremio"]');
    await c.page.waitForSelector(".dlg .card2");
  },
  "player:qr": async (c) => {
    await handoff(c);
    await c.page.click('[data-handoff="qr"]');
    await c.page.waitForSelector(".dlg .qr img");
  },
  "player:copied": async (c) => {
    await c.page.context().grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
    await handoff(c);
    await c.page.click('[data-handoff="copy"]');
    await c.page.waitForSelector(".toasts .toast");
  },
  "player:episodes": async (c) => {
    await playing(c, `${STRANGER}:4:1`);
    await c.page.click('[data-action="episodes"]');
    await c.page.waitForSelector(".drawer .ep img");
    await sleep(300);
  },
  "player:next-episode": async (c) => {
    await playing(c, `${STRANGER}:4:1`, "?t=57.5");
    await c.page.waitForSelector(".nextcard", { timeout: 15000 });
    await c.page.waitForFunction(() => document.querySelector(".nextcard .ring")?.textContent === "7", null, { timeout: 15000 });
    c.afterShot = () => c.page.click('[data-action="cancel-next"]').catch(() => {});
  },
  "player:end-season": async (c) => {
    await playing(c, `${STRANGER}:4:9`, "?t=58.5");
    await c.page.waitForSelector('.endscreen[data-endscreen="end-season"]', { timeout: 15000 });
  },
  "player:ended": async (c) => {
    await playing(c, MOVIE, "?t=58.5");
    await c.page.waitForSelector('.endscreen[data-endscreen="ended"]', { timeout: 15000 });
  },
  "player:resume": async (c) => {
    await openPlayer(c);
    await c.page.waitForSelector(".dlg .card2");
    await showControls(c);
  },
  "player:loading": async (c) => {
    await hold(c.page, "**/api/play/manifest*", 8000);
    await openPlayer(c);
    await c.page.waitForSelector('.pcenter[data-overlay="loading-link"]');
    await showControls(c);
    c.afterShot = () => c.page.waitForFunction(PLAYING, null, { timeout: 20000 }).catch(() => {});
  },
  "player:buffering": async (c) => {
    await hold(c.page, "**/api/dev/sample.mp4*", 6000);
    await openPlayer(c);
    await c.page.waitForSelector('.pcenter[data-overlay="loading"]');
    await showControls(c);
    c.afterShot = () => c.page.waitForFunction(PLAYING, null, { timeout: 20000 }).catch(() => {});
  },
  "player:stall": async (c) => {
    await hold(c.page, "**/api/dev/sample.mp4*", 25000);
    await openPlayer(c);
    await c.page.waitForFunction(() => /\(12 giây\)/.test(document.querySelector('.pcenter[data-overlay="stall"] .m')?.textContent ?? ""), null, { timeout: 25000 });
    await showControls(c);
  },
  "player:no-audio": async (c) => {
    await playing(c);
    await c.page.waitForSelector('[data-banner="no-audio"]', { timeout: 15000 });
    await showControls(c);
  },
  "player:codec-error": async (c) => {
    await openPlayer(c);
    await c.page.waitForSelector(".dlg .card2", { timeout: 15000 });
    await showControls(c);
  },
  "player:link-expired": async (c) => {
    await playing(c);
    await c.api.scenario(["play-sample", "link-expired"]);
    await hold(c.page, "**/api/play/resolve", 7000);
    await rerequestMedia(c.page);
    await c.page.waitForSelector('.pcenter[data-overlay="relink"]', { timeout: 10000 });
    await c.page.waitForSelector(".toasts .toast.warn");
    await showControls(c);
    c.afterShot = () => c.page.waitForFunction(PLAYING, null, { timeout: 20000 }).catch(() => {});
  },
  "player:link-expired-fail": async (c) => {
    await playing(c);
    await c.api.scenario(["play-sample", "link-expired=fail"]);
    await rerequestMedia(c.page);
    await c.page.waitForSelector(".dlg .card2", { timeout: 15000 });
    await c.page.waitForSelector(".toasts .toast", { state: "detached", timeout: 8000 }).catch(() => {});
    await showControls(c);
  },
  "player:offline": async (c) => {
    await playing(c);
    await c.page.waitForSelector('[data-banner="offline"]');
  },
  "player:help": async (c) => {
    await playing(c);
    await c.page.keyboard.press("?");
    await c.page.waitForSelector(".dlg .kbd");
  },
  // ---------- my-list ----------
  "my-list:default": async (c) => {
    await open(c);
    await c.page.waitForSelector(".grid .card img", { timeout: 30000 });
    await c.page.waitForSelector(".card.wide img", { timeout: 30000 });
  },
  "my-list:hover": async (c) => {
    await ROUTINES["my-list:default"](c);
    await c.page.locator(".grid .card").nth(2).hover();
    await sleep(350);
  },
  "my-list:removed": async (c) => {
    await ROUTINES["my-list:default"](c);
    const card = c.page.locator(".grid .card").nth(2);
    await card.hover();
    await card.locator('[data-action="remove"]').click();
    await c.page.waitForSelector(".toasts .toast .act");
    await c.page.mouse.move(5, 5);
  },
  "my-list:bulk": async (c) => {
    await ROUTINES["my-list:default"](c);
    await c.page.click('[data-bulk="off"]');
    for (const i of [1, 4, 6]) await c.page.locator(".grid .card").nth(i).click();
    await c.page.waitForSelector("[data-bulkbar]");
    await c.page.mouse.move(5, 5);
  },
  "my-list:clear-confirm": async (c) => {
    await ROUTINES["my-list:default"](c);
    await c.page.click('[data-action="clear-history"]');
    await c.page.waitForSelector(".dlg .card2");
  },
  "my-list:empty-continue": async (c) => {
    await open(c);
    await c.page.waitForSelector(".emptybox");
    await c.page.waitForSelector(".grid .card img", { timeout: 30000 });
  },
  "my-list:empty": async (c) => {
    await open(c);
    await c.page.waitForSelector(".emptybox a.btn");
  },
  "my-list:list-view": async (c) => {
    await ROUTINES["my-list:default"](c);
    await c.page.click('[data-view="list"]');
    await c.page.waitForSelector("table.mylist tbody tr img");
  },
  // ---------- series progress states ----------
  "series:default": async (c) => {
    await open(c);
    await c.page.waitForSelector('[data-series-primary="continue"]');
    await c.page.waitForSelector('.eps .ep[data-episode="1"] .bar');
  },
  "series:fresh": async (c) => {
    await open(c);
    await c.page.waitForSelector('[data-series-primary="first"]');
    await c.page.waitForSelector('.eps .ep[data-episode="1"] .tag, .eps .ep[data-episode="1"] .watched', { timeout: 30000 });
  },
  "series:next-ep": async (c) => {
    await open(c);
    await c.page.waitForSelector('[data-series-primary="next"]');
    await c.page.waitForSelector('.eps .ep[data-episode="1"] .watched');
  },
  "series:finished": async (c) => {
    await open(c);
    await c.page.waitForSelector('[data-series-primary="replay"]');
    await c.page.waitForSelector('.eps .ep[data-episode="1"] .watched');
  },
  "series:context-menu": async (c) => {
    await ROUTINES["series:default"](c);
    await c.page.click('[data-episode-menu="2"]');
    await c.page.waitForSelector(".menu2");
  },
  // ---------- index / detail / global ----------
  "index:default": async (c) => {
    await open(c);
    await c.page.waitForSelector(".card.wide img", { timeout: 30000 });
    await c.page.waitForSelector(".top10 .t10 img");
  },
  "detail:resume": async (c) => {
    await open(c);
    await c.page.waitForSelector("[data-resume]", { timeout: 30000 });
  },
  "global:limit-5": async (c) => {
    await openPlayer(c);
    await c.page.waitForSelector(".dlg .card2");
    await showControls(c);
  },
};
