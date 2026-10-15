// Phase 2 UX / behaviour checks with Playwright against a RUNNING dev server (LUMEN_SCENARIOS=1).
//   node tests/qa-ux-phase2-playwright.mjs [--base http://localhost:3000] [--skip-rotation]
// Covers: hero rotation + pause, hover panel delay, `/` opens search, Esc closes, recent searches persist,
// filter URL sync + back button, infinite scroll page 2, season dropdown keyboard, notifications mark read,
// My List toggle + toast undo, 0 console errors on every Phase-2 page. Admin creds from .env.local (never printed).
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, request } from "@playwright/test";
import { adminCreds, makeReporter, readEnv, sleep } from "./qa-shared-helpers.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const BASE = args.includes("--base") ? args[args.indexOf("--base") + 1] : "http://localhost:3000";
const SKIP_ROTATION = args.includes("--skip-rotation");
const ADMIN = adminCreds(readEnv(ROOT));
const report = makeReporter();
const { check } = report;

let seeder;
async function seed(fixture) { const r = await seeder.post(BASE + "/api/dev/seed", { data: fixture }); return { status: r.status(), json: await r.json().catch(() => ({})) }; }

async function newCtx(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "vi-VN" });
  const consoleErrors = [];
  ctx.on("page", (p) => {
    // the browser logs its own "Failed to load resource … 404" for the deliberately not-found detail page (a real HTTP 404 since fix round 1)
    p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource: the server responded with a status of 404/.test(m.text())) consoleErrors.push(`${p.url()} :: ${m.text().slice(0, 200)}`); });
    p.on("pageerror", (e) => consoleErrors.push(`${p.url()} :: pageerror ${String(e).slice(0, 200)}`));
  });
  const r = await ctx.request.post(BASE + "/api/auth/login", { data: { username: ADMIN.u, password: ADMIN.p, remember: true } });
  if (!r.ok()) { console.error(`admin login failed: ${r.status()}`); process.exit(2); }
  await ctx.request.post(BASE + "/api/dev/scenario", { data: { flags: [] } });
  return { ctx, consoleErrors };
}

async function goto(page, url) {
  try { await page.goto(url); } catch (e) { if (!/ERR_ABORTED/.test(String(e))) throw e; await page.goto(url); }
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
}

async function main() {
  const browser = await chromium.launch();
  seeder = await request.newContext();
  await seeder.post(BASE + "/api/auth/login", { data: { username: ADMIN.u, password: ADMIN.p, remember: false } });
  await seed({ fixture: "clear-user-media" });
  await seed({ fixture: "notifications" });
  const { ctx, consoleErrors } = await newCtx(browser);
  const page = await ctx.newPage();

  // ---------------------------------------------------------------- home: hero rotation + pause
  await goto(page, BASE + "/");
  check("home renders hero + Top 10 numerals", (await page.$(".hero h1")) !== null && (await page.$$(".top10 .t10 .num")).length === 10);
  check("hero dots: 5, first active", (await page.$$(".hero .dots i")).length === 5 && (await page.$eval(".hero .dots i", (i) => i.style.width)) === "18px");
  if (!SKIP_ROTATION) {
    const i0 = await page.getAttribute(".hero", "data-hero-index");
    await page.mouse.move(5, 850); // keep the pointer off the hero
    await sleep(8600);
    const i1 = await page.getAttribute(".hero", "data-hero-index");
    check("hero rotates after 8 s", i0 === "0" && i1 === "1", `${i0} → ${i1}`);
    await page.hover(".hero h1");
    check("hero paused on hover", (await page.getAttribute(".hero", "data-paused")) === "true");
    await sleep(8600);
    check("no rotation while hovered", (await page.getAttribute(".hero", "data-hero-index")) === i1);
    await page.mouse.move(5, 850);
  }
  await page.click(".hero .dots i >> nth=2");
  check("dot click jumps to slide 3", (await page.getAttribute(".hero", "data-hero-index")) === "2");

  // ---------------------------------------------------------------- hover panel delay (400 ms)
  const card = page.locator("main > section").nth(2).locator(".card").nth(1);
  await card.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -120));
  await card.hover();
  await sleep(150);
  check("hover panel not yet open at 150 ms", (await page.$(".card.hov .hoverpanel")) === null);
  await sleep(450);
  check("hover panel open after ≥ 400 ms", (await page.$(".card.hov .hoverpanel")) !== null);
  await page.waitForFunction(() => !/…/.test(document.querySelector(".hoverpanel .m")?.textContent ?? "…"), null, { timeout: 10000 }).catch(() => {});
  const metaText = await page.textContent(".hoverpanel .m");
  check("hover meta shows year · runtime · ★", /\d{4} · .+ · ★ /.test(metaText ?? ""), metaText ?? "");
  await page.mouse.move(5, 850);
  await sleep(100);
  check("hover panel closes on leave", (await page.$(".card.hov")) === null);

  // ---------------------------------------------------------------- My List toggle + toast undo (hero button)
  const saveBtn = page.locator('.hero button[data-saved]');
  check("hero list button starts unsaved", (await saveBtn.getAttribute("data-saved")) === "false");
  await saveBtn.click();
  await page.waitForSelector('.hero button[data-saved="true"]');
  const toast = await page.textContent(".toasts .toast");
  check("toast ✓ Đã thêm … vào danh sách + Hoàn tác", /^✓ Đã thêm ".+" vào danh sách/.test(toast ?? "") && /Hoàn tác/.test(toast ?? ""), toast ?? "");
  check("button reads ✓ Đã lưu", (await saveBtn.textContent())?.trim() === "✓ Đã lưu");
  await page.click(".toasts .toast .act");
  await page.waitForSelector('.hero button[data-saved="false"]');
  check("Hoàn tác removes again (＋ Danh sách)", (await saveBtn.textContent())?.trim() === "＋ Danh sách");

  // ---------------------------------------------------------------- notifications
  await page.click(".hicons .bell-wrap");
  await page.waitForSelector(".notif .it.unread"); // `.it` alone also matches the transient "…" loading row
  check("badge shows 2 unread", (await page.textContent(".badge-dot")) === "2");
  check("4 rows, 2 unread, mark-read link", (await page.$$(".notif .it")).length === 4 && (await page.$$(".notif .it.unread")).length === 2 && (await page.$(".notif .hd button")) !== null);
  await page.click(".notif .hd button");
  await page.waitForFunction(() => document.querySelectorAll(".notif .it.unread").length === 0);
  check("Đánh dấu đã đọc clears unread + badge", (await page.$(".badge-dot")) === null);
  await page.keyboard.press("Escape");
  check("Esc closes notifications", (await page.$(".notif")) === null);

  // ---------------------------------------------------------------- search overlay: `/`, Esc, recent searches
  await page.keyboard.press("/");
  await page.waitForSelector(".sov input");
  check("`/` opens search overlay with focus", await page.evaluate(() => document.activeElement?.closest(".sov") !== null));
  await page.fill(".sov input", "spider");
  await page.waitForSelector(".sov .dd .r img", { timeout: 15000 });
  check("≤ 8 results + Xem tất cả", (await page.$$(".sov .dd .r")).length <= 8 && /Xem tất cả kết quả \(\d+\) ↵/.test((await page.textContent(".sov .more")) ?? ""));
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/search\?q=spider/);
  check("Enter → /search?q=", page.url().includes("/search?q=spider"));
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  check("search page tabs + grid", /Tất cả \(\d+\)/.test((await page.textContent(".fbar")) ?? "") && (await page.$$(".gridwrap .grid .card")).length > 0);
  const recent = await page.evaluate(() => JSON.parse(localStorage.getItem("lumen.recentSearches") ?? "[]"));
  check("recent searches persisted in localStorage", recent[0] === "spider", JSON.stringify(recent));
  await page.keyboard.press("/");
  await page.waitForSelector(".sov .sec");
  check("empty overlay lists recent searches", /Tìm gần đây/.test((await page.textContent(".sov .dd")) ?? "") && /spider/.test((await page.textContent(".sov .dd")) ?? ""));
  await page.keyboard.press("Escape");
  check("Esc closes overlay", (await page.$(".sov")) === null);
  await goto(page, BASE + "/search?q=spider");
  await page.keyboard.press("/");
  await page.waitForSelector(".sov .sec");
  check("recent searches survive reload", /spider/.test((await page.textContent(".sov .dd")) ?? ""));
  await page.keyboard.press("Escape");

  // ---------------------------------------------------------------- browse: filter URL sync + back button + infinite scroll
  await goto(page, BASE + "/movies");
  await page.waitForSelector(".gridwrap .grid .card img", { timeout: 15000 });
  const firstTitle = await page.textContent(".gridwrap .grid .card .n");
  await page.click('[data-filter="year"]');
  await page.click(".menu2 div >> text=2010s");
  await page.waitForURL(/\/movies\?year=2010s/);
  check("year filter syncs to URL", page.url().endsWith("/movies?year=2010s"));
  await page.waitForFunction((t) => document.querySelector(".gridwrap .grid .card .n")?.textContent !== t, firstTitle, { timeout: 15000 });
  check("chip label updates", /Năm: 2010s ▾/.test((await page.textContent('[data-filter="year"]')) ?? ""));
  await page.click('[data-filter="sort"]');
  await page.click(".menu2 div >> text=Đánh giá cao");
  await page.waitForURL(/sort=top/);
  check("sort appended to URL", /year=2010s&sort=top/.test(page.url()), page.url());
  await page.goBack();
  await page.waitForURL(/\/movies\?year=2010s$/);
  check("back restores previous filter URL", page.url().endsWith("/movies?year=2010s"));
  const sortRestored = await page.waitForFunction(() => /Sắp xếp: Thịnh hành ▾/.test(document.querySelector('[data-filter="sort"]')?.textContent ?? ""), null, { timeout: 10000 }).then(() => true, () => false);
  check("back restores sort chip", sortRestored, (await page.textContent('[data-filter="sort"]')) ?? "");
  await page.goBack();
  await page.waitForURL(/\/movies$/);
  check("back to unfiltered", page.url().endsWith("/movies"));
  await page.waitForSelector('.gridwrap[data-status="ready"] .grid .card img', { timeout: 15000 });
  const realCards = () => page.$$eval(".gridwrap .grid .card:not(.sk)", (els) => els.length); // skeleton cards (.sk) are not results
  const before = await realCards();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  // TMDB popularity shifts between calls, so a later page may repeat a title the grid already shows (it dedupes by mediaKey): ≥ 15 new cards = the page loaded
  await page.waitForFunction((n) => document.querySelectorAll(".gridwrap .grid .card:not(.sk)").length >= n + 15, before, { timeout: 15000 });
  const after = await realCards();
  check("infinite scroll loads the next page", after >= before + 15, `${before} → ${after}`);

  // ---------------------------------------------------------------- series: season dropdown via keyboard
  await goto(page, BASE + "/series/66732?s=4");
  await page.waitForSelector(".eps .ep");
  check("season 4 episodes with 1g Np runtimes", /\d+g \d+p/.test((await page.textContent(".eps .ep .n")) ?? ""));
  await page.focus(".eps .dd");
  await page.keyboard.press("Enter");
  await page.waitForSelector(".menu2.seasonmenu");
  check("Enter opens season menu with ✓ on Mùa 4", /✓ Mùa 4/.test((await page.textContent(".menu2.seasonmenu div.on")) ?? ""));
  // Radix focuses the first row on keyboard-open: ↓ once → "Mùa 2"; the assertion only requires season/URL/label to agree
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelector(".eps")?.getAttribute("data-season") !== "4", null, { timeout: 10000 });
  await page.waitForSelector('.eps[data-status="ready"] .ep');
  const picked = await page.getAttribute(".eps", "data-season");
  check("keyboard picks another season + URL ?s= + label agree", picked !== "4" && page.url().endsWith(`?s=${picked}`) && (await page.textContent(".eps .dd"))?.includes(`Mùa ${picked}`), `picked ${picked} url ${page.url()}`);

  // ---------------------------------------------------------------- 0 console errors on every Phase-2 page
  for (const p of ["/", "/movies", "/series", "/anime", "/search?q=dune", "/search?q=s", "/movie/634649", "/series/66732?s=4", "/movie/999999999"]) await goto(page, BASE + p);
  check("404 page for unknown movie id", (await page.$(".emptybox")) !== null);
  check("0 console errors across Phase-2 pages", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));

  await ctx.request.post(BASE + "/api/auth/logout").catch(() => {});
  await ctx.close();
  await seeder.post(BASE + "/api/auth/logout").catch(() => {});
  await seeder.dispose();
  await browser.close();
  report.finish();
}

main().catch((err) => { console.error(err); process.exit(1); });
