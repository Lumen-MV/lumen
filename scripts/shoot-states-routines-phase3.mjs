// Phase 3 (sources) routines for scripts/shoot-states.mjs, keyed `page:state`: detail primary states, the source picker
// (all 9 states), series downloading chip + episode picker, browse cached-only, logout-confirm. Real Torrentio + TorBox
// checkcached data; cloud jobs come from the dev fake TorBox (cookie `cloud-sim=…` / fixture `cloud-jobs`) — no real
// download is ever started. `SETUPS` are the extra manifest `setup` entries this phase needs.
import { hold, open, sleep } from "./shoot-states-routines-phase2-helpers.mjs";

const SPIDERMAN = "movie:634649";
const STRANGER = "tv:66732";
const PICK_OTHER = '[data-action="pick-other"]';
const ROW = ".modal .box .src[data-hash]";

/** Top 3 hashes of the title's release list (admin API context). */
async function topHashes(api, mediaKey, n = 3) {
  const res = await api.get(`/api/sources?mediaKey=${encodeURIComponent(mediaKey)}&show4k=0`);
  return (res.releases ?? []).slice(0, n).map((r) => r.hash);
}

export const SETUPS = {
  "clear-cloud-jobs": (api) => api.seed({ fixture: "clear-cloud-jobs" }),
  // rows 2 + 3 of the picker: TorBox-queued (10/10 slot) and failed; row 1 is created live by the routine (toast + 73 %)
  "cloud-jobs:picker-progress": async (api) => {
    const [, queued, error] = await topHashes(api, SPIDERMAN);
    await api.seed({ fixture: "clear-cloud-jobs" });
    await api.seed({ fixture: "cloud-jobs", mediaKey: SPIDERMAN, title: "Người Nhện: Không Còn Nhà", jobs: [{ hash: queued, state: "queued" }, { hash: error, state: "error" }] });
  },
  "cloud-jobs:series-downloading": async (api) => {
    const [hash] = await topHashes(api, `${STRANGER}:4:2`, 1);
    await api.seed({ fixture: "clear-cloud-jobs" });
    await api.seed({ fixture: "cloud-jobs", mediaKey: `${STRANGER}:4:2`, title: "Stranger Things", jobs: [{ hash, state: "downloading", progress: 40 }] });
  },
  "cloud-jobs:logout": async (api) => {
    await api.seed({ fixture: "clear-cloud-jobs" });
    await api.seed({ fixture: "cloud-jobs", mediaKey: "movie:533535", title: "Deadpool & Wolverine", jobs: [{ hash: "d".repeat(40), state: "downloading", progress: 73 }] });
  },
};

const waitPrimary = (c, state) => c.page.waitForSelector(`[data-primary="${state}"]`, { timeout: 30000 });

async function openPicker(c) {
  await open(c);
  await c.page.waitForSelector('[data-primary]:not([data-primary="loading"])', { timeout: 30000 });
  await c.page.click(PICK_OTHER);
  await c.page.waitForSelector(".modal .box");
}

/** Intercepts /api/sources and rewrites the real answer (app-only / empty variants the live catalogue cannot produce on demand). */
const rewriteSources = (page, fn) =>
  page.route("**/api/sources?*", async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fn(body)) });
  });

export const ROUTINES = {
  // ---------- detail primary states ----------
  "detail:cached": async (c) => {
    await open(c);
    await waitPrimary(c, "direct");
  },
  "detail:uncached": async (c) => {
    await open(c);
    await waitPrimary(c, "uncached");
  },
  "detail:app-only": async (c) => {
    await rewriteSources(c.page, (b) => {
      const releases = b.releases.filter((r) => r.playClass === "app");
      const best = releases.find((r) => r.cacheState === "cached") ?? releases[0] ?? null;
      if (best) best.recommended = best.cacheState === "cached";
      return { ...b, releases, best };
    });
    await open(c);
    await waitPrimary(c, "app");
  },
  "detail:loading": async (c) => {
    await hold(c.page, "**/api/sources?*", 8000);
    await open(c);
    await waitPrimary(c, "loading");
    await sleep(300);
    c.afterShot = () => c.page.waitForSelector('[data-primary]:not([data-primary="loading"])', { timeout: 30000 }).catch(() => {});
  },
  "detail:no-sources": async (c) => {
    await rewriteSources(c.page, (b) => ({ ...b, releases: [], best: null, state: "empty" }));
    await open(c);
    await waitPrimary(c, "none");
  },
  // ---------- picker ----------
  "detail:picker": async (c) => {
    await openPicker(c);
    await c.page.waitForSelector(ROW);
  },
  "detail:picker-4k": async (c) => {
    // the toggle persists show_4k → always undo it afterwards (cleanup runs even if the state fails)
    c.cleanup = () => c.page.request.patch(`${c.api.base}/api/me/settings`, { data: { show_4k: false } });
    await openPicker(c);
    await c.page.waitForSelector(ROW);
    await c.page.click('[data-toggle="4k"]');
    await c.page.waitForSelector('.modal .box[data-status="ready"] .src[data-hash] .q:has-text("2160p")', { timeout: 30000 });
    await sleep(200);
  },
  "detail:picker-uncached": async (c) => {
    await openPicker(c);
    await c.page.waitForSelector(".modal .banner.info");
  },
  "detail:picker-progress": async (c) => {
    await openPicker(c);
    await c.page.waitForSelector(`${ROW}[data-job="queued"]`);
    await c.page.click(`${ROW}:not([data-job]) [data-action="cloud"] >> nth=0`);
    await c.page.waitForSelector(`${ROW}[data-job="downloading"]`);
    await c.page.waitForSelector(".toasts .toast.info");
  },
  "detail:picker-cancel": async (c) => {
    await ROUTINES["detail:picker-progress"](c);
    await c.page.click(`${ROW}[data-job="downloading"] [data-action="cancel"]`);
    await c.page.waitForSelector(".dlg .card2");
    await c.page.waitForSelector(".toasts .toast", { state: "detached", timeout: 8000 }).catch(() => {});
  },
  "detail:picker-torbox-down": async (c) => {
    await openPicker(c);
    await c.page.waitForSelector(".modal .banner.err");
    await c.page.waitForSelector(".modal .src.dim");
  },
  "detail:picker-empty": async (c) => {
    await rewriteSources(c.page, (b) => ({ ...b, releases: [], best: null, state: "empty" }));
    await openPicker(c);
    await c.page.waitForSelector("[data-picker-empty]");
  },
  "detail:picker-loading": async (c) => {
    await open(c);
    await c.page.waitForSelector('[data-primary]:not([data-primary="loading"])', { timeout: 30000 });
    await hold(c.page, "**/api/sources?*", 8000);
    await c.page.reload();
    await c.page.waitForSelector(PICK_OTHER);
    await c.page.click(PICK_OTHER);
    await c.page.waitForSelector("[data-picker-loading]");
    await sleep(300);
    c.afterShot = () => c.page.waitForSelector(ROW, { timeout: 30000 }).catch(() => {});
  },
  "detail:mobile-sheet": async (c) => {
    await openPicker(c);
    await c.page.waitForSelector(ROW);
  },
  // ---------- series ----------
  "series:downloading": async (c) => {
    await open(c);
    await c.page.waitForSelector(".eps .ep");
    await c.page.waitForSelector('.eps .ep[data-episode="2"] .tag', { timeout: 30000 });
  },
  "series:picker-episode": async (c) => {
    await openPicker(c);
    await c.page.waitForSelector(ROW);
  },
  // ---------- browse ----------
  "browse:cached-only": async (c) => {
    await open(c);
    await c.page.waitForSelector(".gridwrap .grid .card img", { timeout: 30000 });
    await c.page.waitForFunction(() => !/…/.test(document.querySelector(".fbar .cnt")?.textContent ?? "…"));
  },
  // ---------- logout confirm ----------
  "login:logout-confirm": async (c) => {
    await open(c);
    await c.page.click("header .avatar");
    await c.page.click('.menu2 [role="menuitem"]:has-text("Đăng xuất")');
    await c.page.waitForSelector(".dlg .card2");
    c.afterShot = async () => {
      await c.page.click('.dlg .card2 .acts button:has-text("Ở lại")');
      await c.page.waitForSelector(".dlg", { state: "detached" });
    };
  },
};
