// Phase 2 (catalog) routines for scripts/shoot-states.mjs, part 1: home (index) + browse, keyed `page:state`.
// Real TMDB data + scenario flags (tmdb-down / tmdb-row-down / slow-net) + seeded rows reproduce each mockup state.
// Part 2 (search page, movie + series detail) lives in shoot-states-routines-phase2-detail.mjs.
import { hold, isMobile, open, openPending, openSearch, scrollToBottom, sleep } from "./shoot-states-routines-phase2-helpers.mjs";

export const ROUTINES = {
  // ---------- index (home) ----------
  "index:first-time": async (c) => {
    await open(c);
    await c.page.waitForSelector(".hero h1");
    await c.page.waitForSelector(".top10 .t10 img");
  },
  "index:loading": (c) => openPending(c, ".skhero"),
  "index:error": async (c) => {
    await open(c);
    await c.page.waitForSelector(".errbox");
  },
  "index:row-error": async (c) => {
    await open(c);
    await c.page.waitForSelector("section .errbox");
  },
  "index:hover": async (c) => {
    await open(c);
    const card = c.page.locator("main > section").nth(3).locator(".card").nth(2);
    await card.evaluate((el) => el.scrollIntoView({ block: "center" })); // leaves room below for the panel
    await c.page.mouse.move(5, 5);
    await card.hover();
    // the hover panel is desktop-only by design (≤ 900 px a tap opens the detail page) → mobile shoots the plain row
    if (!isMobile(c)) await c.page.waitForSelector(".card.hov .hoverpanel", { timeout: 5000 });
    await c.page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    await sleep(300);
  },
  "index:saved": async (c) => {
    await open(c);
    await c.page.click('.hero button[data-saved="false"]');
    await c.page.waitForSelector('.hero button[data-saved="true"]');
    await c.page.waitForSelector(".toasts .toast");
  },
  "index:notifications": async (c) => {
    await open(c);
    await c.page.click(".hicons .bell-wrap");
    await c.page.waitForSelector(".notif .it.unread");
  },
  "index:search": async (c) => {
    await openSearch(c, "spider");
    await c.page.waitForSelector(".sov .dd .r img", { timeout: 15000 });
    await sleep(300);
  },
  "index:search-empty": async (c) => {
    await openSearch(c, "phim gi do");
    await c.page.waitForSelector('.sov[data-status="done"]', { timeout: 15000 });
  },
  "index:search-recent": async (c) => {
    await open(c);
    await c.page.evaluate(() => localStorage.setItem("lumen.recentSearches", JSON.stringify(["spider man", "dune", "squid game", "one piece"])));
    await c.page.keyboard.press("/");
    await c.page.waitForSelector(".sov .sec");
  },
  "index:search-loading": async (c) => {
    await open(c);
    await hold(c.page, "**/api/catalog/search*", 6000);
    await c.page.keyboard.press("/");
    await c.page.waitForSelector(".sov input");
    await c.page.fill(".sov input", "interst");
    await c.page.waitForSelector('.sov[data-status="loading"]');
    await sleep(400);
  },
  // ---------- browse (/movies) ----------
  "browse:default": async (c) => {
    await open(c);
    await c.page.waitForSelector(".gridwrap .grid .card img", { timeout: 15000 });
    await c.page.waitForFunction(() => !/…/.test(document.querySelector(".fbar .cnt")?.textContent ?? "…"));
  },
  "browse:loading": (c) => openPending(c, ".gridwrap .card.sk"),
  // ≤ 700 px the desktop chips collapse into "Lọc (n)" (plan), so the mobile equivalent of an open chip menu is the sheet
  "browse:year-open": async (c) => {
    if (isMobile(c)) return ROUTINES["browse:filter-sheet"](c);
    await ROUTINES["browse:default"](c);
    await c.page.click('[data-filter="year"]');
    await c.page.waitForSelector(".menu2");
  },
  "browse:genre-open": async (c) => {
    if (isMobile(c)) return ROUTINES["browse:filter-sheet"](c);
    await ROUTINES["browse:default"](c);
    await c.page.click('[data-filter="genre"]');
    await c.page.waitForSelector(".menu2 .hint");
  },
  "browse:empty": async (c) => {
    await open(c);
    await c.page.waitForSelector(".gridwrap .emptybox", { timeout: 15000 });
  },
  "browse:loading-more": async (c) => {
    await ROUTINES["browse:default"](c);
    await hold(c.page, "**/api/catalog/discover*page=2*", 6000);
    await scrollToBottom(c.page);
    await c.page.waitForSelector("[data-loading-more]", { timeout: 10000 });
    await scrollToBottom(c.page);
    await sleep(300);
  },
  "browse:end": async (c) => {
    await ROUTINES["browse:default"](c);
    for (let i = 0; i < 10 && !(await c.page.$(".endmsg")); i++) {
      await scrollToBottom(c.page);
      await c.page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    }
    await c.page.waitForSelector(".endmsg");
    await scrollToBottom(c.page);
    await sleep(300);
  },
  "browse:error": async (c) => {
    await open(c);
    await c.page.waitForSelector(".gridwrap .errbox", { timeout: 15000 });
  },
  "browse:filter-sheet": async (c) => {
    // `cached=1` is real since Phase 3 (title_sources ∩ genres may be empty) → wait for the grid OR the empty box, not for cards
    await open(c);
    await c.page.waitForSelector('.gridwrap[data-status="ready"]', { timeout: 15000 });
    // the "Lọc (n)" chip only exists ≤700px; desktop opens the same sheet programmatically
    await c.page.evaluate(() => document.querySelector('[data-filter="mobile"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await c.page.waitForSelector(".sheet .grp");
  },
};
