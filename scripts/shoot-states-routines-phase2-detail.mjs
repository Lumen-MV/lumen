// Phase 2 routines, part 2: /search page, movie detail, series detail (keyed `page:state`, admin session).
import { asAdmin, hold, open, openPending, sleep } from "./shoot-states-routines-phase2-helpers.mjs";

export const ROUTINES = {
  // ---------- search page ----------
  "search:default": async (c) => {
    await open(c);
    await c.page.waitForSelector(".gridwrap .grid .card img", { timeout: 15000 });
  },
  "search:empty": async (c) => {
    await open(c);
    await c.page.waitForSelector(".gridwrap .emptybox");
  },
  "search:short-query": async (c) => {
    await open(c);
    await c.page.waitForSelector(".gridwrap .emptybox");
  },
  // ---------- movie detail ----------
  "detail:skeleton": (c) => openPending(c, 'main[aria-hidden="true"] .detail'),
  "detail:overview-en": async (c) => {
    await asAdmin(c);
    if (!c.fx.enMovieId) c.fx.enMovieId = await findMovieWithoutViOverview(c);
    await open(c, c.url.replace(/\/movie\/$/, `/movie/${c.fx.enMovieId}`));
    await c.page.waitForSelector('.detail .pill[title="Chưa có mô tả tiếng Việt"]');
  },
  "detail:trailer": async (c) => {
    await open(c);
    await c.page.click('[data-action="trailer"]');
    await c.page.waitForSelector(".dlg .yt");
    await sleep(1500);
  },
  // ---------- series detail ----------
  "series:season-open": async (c) => {
    await open(c);
    await c.page.waitForSelector(".eps .ep");
    await c.page.click(".eps .dd");
    await c.page.waitForSelector(".menu2.seasonmenu");
  },
  "series:loading": async (c) => {
    await open(c);
    await c.page.waitForSelector(".eps .ep");
    await hold(c.page, "**/api/catalog/series/*/season/*", 6000);
    await c.page.click(".eps .dd");
    await c.page.click('.menu2.seasonmenu [data-season="2"]');
    await c.page.waitForSelector("[data-episodes-loading]");
    await sleep(300);
  },
  "series:empty": async (c) => {
    await open(c);
    await c.page.waitForSelector(".eps .ep");
    // TMDB rarely has a season with zero episodes → answer the season request with an empty list
    await c.page.route("**/api/catalog/series/*/season/5", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ episodes: [], unairedCount: 0 }) }));
    await c.page.click(".eps .dd");
    await c.page.click('.menu2.seasonmenu [data-season="5"]');
    await c.page.waitForSelector(".eps .emptybox");
  },
};

/** Walks a few discover pages (A→Z of the 2010s) until /api/catalog/meta reports a title with no Vietnamese overview. */
async function findMovieWithoutViOverview(c) {
  for (let page = 1; page <= 6; page++) {
    const res = await c.page.request.get(`${c.api.base}/api/catalog/discover?type=movie&year=2010s&sort=az&page=${page}`);
    const { items = [] } = await res.json();
    for (const it of items) {
      const meta = await (await c.page.request.get(`${c.api.base}/api/catalog/meta?key=${encodeURIComponent(it.mediaKey)}`)).json();
      if (meta.overviewLang === "en") return it.tmdbId;
    }
  }
  throw new Error("no movie without a Vietnamese overview found");
}
