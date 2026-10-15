// Phase 4 lists UX checks (Playwright, RUNNING dev server with LUMEN_SCENARIOS=1): home "Tiếp tục xem" row (wide cards, ✕ →
// confirm → removed, click → /watch?resume=1 without prompt), detail `resume` primary, series hero states (fresh / continue /
// next / replay) + episode bars / "Đã xem ✓" / season counts / ⋯ mark watched, /my-list (filter, sort, list view, hover remove +
// Hoàn tác, bulk select + remove, clear history, empty states), 0 console errors.   node tests/qa-ux-phase4-extra-lists.mjs [--base …]
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, request } from "@playwright/test";
import { adminCreds, makeReporter, readEnv, sleep } from "./qa-shared-helpers.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const BASE = args.includes("--base") ? args[args.indexOf("--base") + 1] : "http://localhost:3000";
const ADMIN = adminCreds(readEnv(ROOT));
const report = makeReporter();
const { check } = report;
const MOVIE = "movie:634649";
const STRANGER = "tv:66732";
const pct = (mediaKey, p) => ({ mediaKey, positionS: p * 60, durationS: 6000 });
const CW = [pct(MOVIE, 62), pct("tv:1399:1:4", 85), pct("movie:872585", 30), pct(`${STRANGER}:4:1`, 12), pct("movie:1022789", 48), pct("tv:93405:2:3", 70)].map((r, i) => ({ ...r, agoMs: i * 3_600_000 }));
const LIST = ["movie:693134", "tv:100088", "movie:533535", "tv:126308", "movie:402431", "movie:157336", "tv:94605", "movie:1184918", "tv:209867", "movie:558449", "movie:12", "tv:85937", "movie:1241982", "movie:438148"].map((mediaKey, i) => ({ mediaKey, daysAgo: i + 1 }));

let seeder;
const seed = (fixture) => seeder.post(BASE + "/api/dev/seed", { data: fixture });

async function newCtx(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "vi-VN" });
  const consoleErrors = [];
  ctx.on("page", (p) => {
    p.on("console", (m) => { if (m.type() === "error" && !/status of (404|503)/.test(m.text())) consoleErrors.push(`${p.url()} :: ${m.text().slice(0, 200)}`); });
    p.on("pageerror", (e) => consoleErrors.push(`${p.url()} :: pageerror ${String(e).slice(0, 200)}`));
  });
  const r = await ctx.request.post(BASE + "/api/auth/login", { data: { username: ADMIN.u, password: ADMIN.p, remember: true } });
  if (!r.ok()) { console.error(`admin login failed: ${r.status()}`); process.exit(2); }
  await ctx.request.post(BASE + "/api/dev/scenario", { data: { flags: ["play-sample"] } });
  return { ctx, consoleErrors };
}
async function goto(page, url) {
  try { await page.goto(url); } catch (e) { if (!/ERR_ABORTED/.test(String(e))) throw e; await page.goto(url); }
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
}
const text = async (page, sel) => ((await page.textContent(sel)) ?? "").trim();
/** locator.click() re-scrolls the row's overflow box under the sticky header; click the hovered ✕ where it is */
async function clickAt(page, locator) {
  const b = await locator.boundingBox();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
}

async function main() {
  // autoplay must not depend on Playwright evaluate timing (its first evaluate carries the user gesture): real viewers arrive by a click + router.push
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  seeder = await request.newContext();
  await seeder.post(BASE + "/api/auth/login", { data: { username: ADMIN.u, password: ADMIN.p, remember: false } });
  await seed({ fixture: "clear-views" });
  const { ctx, consoleErrors } = await newCtx(browser);
  const page = await ctx.newPage();

  // ---------------------------------------------------------------- home continue row
  await seed({ fixture: "progress", rows: CW });
  await goto(page, BASE + "/");
  await page.waitForSelector(".card.wide img", { timeout: 30000 });
  check("home: 'Tiếp tục xem' is the first section with 6 wide cards (bar + title + S4 T1 chip)", (await text(page, "main > section:first-of-type h2")) === "Tiếp tục xem" && (await page.$$(".card.wide")).length === 6 && (await page.$eval(`.card.wide[data-media-key="${MOVIE}"] .bar i`, (el) => el.style.width)) === "62%" && (await text(page, `.card.wide[data-media-key="${STRANGER}:4:1"] .ep`)) === "S4 T1");
  check("home: 'Xem tất cả ›' → /my-list", (await page.getAttribute('main > section:first-of-type .h a[href="/my-list"]', "href")) === "/my-list");
  const card = page.locator(`.card.wide[data-media-key="${MOVIE}"]`);
  // the row is its own overflow box: scroll the WINDOW so the card sits clear of the sticky header
  await card.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 300));
  await sleep(300);
  await card.hover();
  await clickAt(page, card.locator('[data-action="remove"]'));
  await page.waitForSelector(".dlg .card2");
  check("✕ → 'Xoá khỏi Tiếp tục xem?' names the title + 62 %", /Xoá khỏi Tiếp tục xem\?/.test(await text(page, ".dlg .card2 h3")) && /Người Nhện.*\(62%\)/.test(await text(page, ".dlg .card2 p")));
  await page.click('.dlg .acts button:has-text("Huỷ")');
  await page.waitForSelector(".dlg", { state: "detached" });
  check("Huỷ keeps the card", (await page.$$(".card.wide")).length === 6);
  await card.hover();
  await clickAt(page, card.locator('[data-action="remove"]'));
  // the card leaves optimistically; wait for the DELETE itself (cold dev compile can take seconds) before asking the server
  const deleted = page.waitForResponse((r) => r.request().method() === "DELETE" && r.url().includes("/api/progress?mediaKey="), { timeout: 30000 });
  await page.click('.dlg .acts button:has-text("Xoá")');
  await page.waitForSelector(`.card.wide[data-media-key="${MOVIE}"]`, { state: "detached" });
  await deleted;
  const after = await (await ctx.request.get(BASE + "/api/progress/continue")).json();
  check("Xoá removes the card and the row server-side", (await page.$$(".card.wide")).length === 5 && !after.items.some((i) => i.mediaKey === MOVIE));
  const next = page.locator(`.card.wide[data-media-key="movie:872585"]`);
  await next.hover();
  await clickAt(page, next.locator('[data-action="play"]'));
  await page.waitForURL(/\/watch\/[0-9a-f]{32}\?resume=1$/, { timeout: 20000 });
  await page.waitForFunction(() => { const v = document.querySelector("video"); return v && !v.paused && v.currentTime > 0.3; }, null, { timeout: 20000 });
  check("continue card → /watch?resume=1, no prompt, starts at the saved position (clamped to the sample)", (await page.$(".dlg")) === null && (await page.evaluate(() => document.querySelector("video").currentTime)) > 30);
  await page.goto("about:blank");
  await sleep(600);

  // ---------------------------------------------------------------- detail resume
  await seed({ fixture: "progress", rows: [{ mediaKey: MOVIE, positionS: 3672, durationS: 8900, device: "iPhone", agoMs: 26 * 3_600_000 }] });
  await goto(page, `${BASE}/movie/634649`);
  await page.waitForSelector("[data-resume]", { timeout: 30000 });
  check("detail resume: '▶ Tiếp tục · 1:01:12' + 'Xem từ đầu' link", (await text(page, "[data-resume]")) === "▶ Tiếp tục · 1:01:12" && (await text(page, '[data-action="restart"]')) === "Xem từ đầu");
  await page.click('[data-action="restart"]');
  await page.waitForURL(/\/watch\/[0-9a-f]{32}\?t=0$/, { timeout: 20000 });
  check("Xem từ đầu → /watch?t=0", /\/watch\/[0-9a-f]{32}\?t=0$/.test(page.url()) && (await page.$(".player")) !== null);
  await page.goto("about:blank");
  await sleep(600);
  // QR deep link: ?play=1&t=20 must win over the saved 3672 s position and start silently at 20 s
  await goto(page, `${BASE}/movie/634649?play=1&t=20`);
  await page.waitForURL(/\/watch\/[0-9a-f]{32}\?t=20$/, { timeout: 30000 });
  await page.waitForFunction(() => { const v = document.querySelector("video"); return Boolean(v && !v.paused && v.currentTime > 0.3); }, null, { timeout: 20000 });
  check("QR deep link ?play=1&t=20 → /watch?t=20, starts at ~20 s, no resume prompt", (await page.evaluate(() => document.querySelector("video").currentTime)) >= 19 && (await page.$(".dlg")) === null, String(await page.evaluate(() => document.querySelector("video").currentTime)));
  await page.goto("about:blank");
  await sleep(600);

  // ---------------------------------------------------------------- series hero states
  const series = `${BASE}/series/66732?s=4`;
  await seed({ fixture: "progress", rows: [] });
  await goto(page, `${BASE}/series/66732?s=1`);
  await page.waitForSelector("[data-series-primary]", { timeout: 30000 });
  check("fresh: '▶ Phát S1 T1' + 'Chưa xem' + kv '—'", (await text(page, "[data-series-primary]")) === "▶ Phát S1 T1" && (await text(page, '[data-facts="fresh"]')) === "Chưa xem" && (await text(page, "[data-watching]")) === "—");
  await seed({ fixture: "progress", rows: [{ mediaKey: `${STRANGER}:4:1`, positionS: 760, durationS: 6333 }] });
  await goto(page, series);
  await page.waitForSelector('[data-series-primary="continue"]', { timeout: 30000 });
  // deep link with another episode than the progress primary (S4 T1): the highlighted row must stay T2 and ?pick=1 opens the picker for T2
  await goto(page, `${series}&e=2&pick=1`);
  await page.waitForSelector(".modal .box", { timeout: 30000 });
  await sleep(500);
  check("?s=4&e=2&pick=1 keeps S4 T2 highlighted (primary S4 T1 does not override) and opens the picker for T2", (await page.$('.eps .ep.on[data-episode="2"]')) !== null && /S4 T2/.test(await text(page, ".modal .box .hd")), await text(page, ".modal .box .hd"));
  await page.keyboard.press("Escape");
  await goto(page, series);
  await page.waitForSelector('[data-series-primary="continue"]', { timeout: 30000 });
  check("in progress: '▶ Tiếp tục S4 T1 · 12:40' + 'Đang xem · S4 T1 · 12%' + kv + bar + .on row", (await text(page, "[data-series-primary]")) === "▶ Tiếp tục S4 T1 · 12:40" && (await text(page, '[data-facts="watching"]')) === "Đang xem · S4 T1 · 12%" && (await text(page, "[data-watching]")) === "S4 T1 · 12%" && (await page.$eval('.eps .ep[data-episode="1"] .bar i', (el) => el.style.width)) === "12%" && (await page.$('.eps .ep.on[data-episode="1"]')) !== null);
  await page.click(".eps .dd");
  await page.waitForSelector(".menu2.seasonmenu");
  check("season menu shows 'đã xem 0/9' for S4", /9 tập · đã xem 0\/9/.test(await text(page, '.menu2.seasonmenu [data-season="4"]')));
  await page.keyboard.press("Escape");
  await page.click('[data-episode-menu="1"]');
  await page.waitForSelector(".menu2");
  check("⋯ menu offers '✓ Đánh dấu đã xem' between Phát and Tải lên cloud", /▶ Phát.*✓ Đánh dấu đã xem.*⬇ Tải lên cloud/s.test(await text(page, ".menu2")));
  await page.click('.menu2 [role="menuitem"]:has-text("Đánh dấu đã xem")');
  await page.waitForSelector('[data-series-primary="next"]', { timeout: 15000 });
  check("mark watched → '▶ Phát tập tiếp S4 T2' + 'Đã xem S4 T1' + 'Đã xem ✓' chip + full bar + .on moves to T2", (await text(page, "[data-series-primary]")) === "▶ Phát tập tiếp S4 T2" && (await text(page, '[data-facts="watched"]')) === "Đã xem S4 T1" && (await text(page, '.eps .ep[data-episode="1"] .watched')) === "Đã xem ✓" && (await page.$eval('.eps .ep[data-episode="1"] .bar i', (el) => el.style.width)) === "100%" && (await page.$('.eps .ep.on[data-episode="2"]')) !== null && (await text(page, "[data-watching]")) === "S4 T2 tiếp theo");
  await page.click(".eps .dd");
  await page.waitForSelector(".menu2.seasonmenu");
  check("season menu now 'đã xem 1/9'", /đã xem 1\/9/.test(await text(page, '.menu2.seasonmenu [data-season="4"]')));
  await page.keyboard.press("Escape");
  await page.click('[data-episode-menu="1"]');
  await page.click('.menu2 [role="menuitem"]:has-text("Đánh dấu chưa xem")');
  await page.waitForSelector('[data-series-primary="first"]', { timeout: 15000 });
  check("mark unwatched → back to '▶ Phát S1 T1'", (await text(page, "[data-series-primary]")) === "▶ Phát S1 T1");
  await seed({ fixture: "progress", rows: [{ mediaKey: STRANGER, allEpisodes: true, completed: true, durationS: 3000 }] });
  await goto(page, `${BASE}/series/66732?s=5`);
  await page.waitForSelector('[data-series-primary="replay"]', { timeout: 30000 });
  check("finished: '▶ Xem lại S1 T1' + 'Đã xem hết N mùa ✓' + 'Hoàn thành'", (await text(page, "[data-series-primary]")) === "▶ Xem lại S1 T1" && /^Đã xem hết \d+ mùa ✓$/.test(await text(page, '[data-facts="done"]')) && (await text(page, "[data-watching]")) === "Hoàn thành");
  await page.click("[data-series-primary]");
  await page.waitForURL(/\/watch\/[0-9a-f]{32}$/, { timeout: 30000 });
  await page.waitForSelector(".ctl .title span", { timeout: 20000 });
  check("replay primary → resolves S1 T1 and opens the player", /\/watch\/[0-9a-f]{32}$/.test(page.url()) && /^S1 T1 · /.test((await text(page, ".ctl .title span")).trim()), await text(page, ".ctl .title span"));
  await page.goto("about:blank");
  await sleep(600);

  // ---------------------------------------------------------------- my list
  await seed({ fixture: "progress", rows: CW });
  await seed({ fixture: "my-list", items: LIST });
  await goto(page, `${BASE}/my-list`);
  await page.waitForSelector(".grid .card img", { timeout: 30000 });
  check("my-list default: continue row (6) + 'Danh sách của tôi · 14 phim' + 14 cards + tools", (await page.$$(".card.wide")).length === 6 && (await text(page, "main > section:nth-of-type(2) h2")) === "Danh sách của tôi · 14 phim" && (await page.$$(".grid .card")).length === 14 && (await text(page, ".tools")).includes("Sắp xếp: Mới thêm ▾"));
  check("header nav 'Danh sách của tôi' is active", (await text(page, "header nav a.on")) === "Danh sách của tôi");
  await page.click('.tools [data-filter="movie"]');
  const movies = (await page.$$(".grid .card")).length;
  await page.click('.tools [data-filter="tv"]');
  const tv = (await page.$$(".grid .card")).length;
  check("filters Phim lẻ / Phim bộ split the 14", movies === 9 && tv === 5, `${movies}+${tv}`);
  await page.click('.tools [data-filter="all"]');
  await page.click('.tools [data-sort]');
  await page.click('.menu2 [role="menuitem"]:has-text("Tên")');
  const names = await page.$$eval(".grid .card .n", (els) => els.map((e) => e.textContent.trim()));
  check("sort Tên → alphabetical (vi) + chip label", [...names].sort((a, b) => a.localeCompare(b, "vi")).join("|") === names.join("|") && (await text(page, ".tools [data-sort]")) === "Sắp xếp: Tên ▾");
  await page.click('.tools [data-sort]');
  await page.click('.menu2 [role="menuitem"]:has-text("Mới thêm")');
  await page.click('.tools [data-view="list"]');
  await page.waitForSelector("table.mylist tbody tr");
  check("list view: 14 rows, poster 36×54, type / year / status tag / 'N ngày trước'", (await page.$$("table.mylist tbody tr")).length === 14 && (await page.$eval("table.mylist tbody tr img", (el) => `${el.getBoundingClientRect().width}x${el.getBoundingClientRect().height}`)) === "36x54" && /1 ngày trước/.test(await text(page, "table.mylist tbody tr:first-child")) && (await page.$("table.mylist tbody tr .tag")) !== null);
  await page.click('.tools [data-view="grid"]');
  await page.waitForSelector(".grid .card");
  const third = page.locator(".grid .card").nth(2);
  const thirdTitle = await third.locator(".n").textContent();
  await third.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 300));
  await sleep(300);
  await third.hover();
  check("hover card → ✕ visible", await third.locator('[data-action="remove"]').isVisible());
  await clickAt(page, third.locator('[data-action="remove"]'));
  await page.waitForSelector(".toasts .toast .act");
  check("remove → 13 cards + toast 'Đã bỏ “…” khỏi danh sách' + Hoàn tác", (await page.$$(".grid .card")).length === 13 && (await text(page, ".toasts .toast")).includes(`Đã bỏ “${thirdTitle.trim()}” khỏi danh sách`));
  await page.click(".toasts .toast .act");
  await page.waitForFunction(() => document.querySelectorAll(".grid .card").length === 14);
  check("Hoàn tác restores the card at its place (server too)", (await page.locator(".grid .card").nth(2).locator(".n").textContent()).trim() === thirdTitle.trim() && (await (await ctx.request.get(BASE + "/api/my-list")).json()).items.length === 14);
  await page.click('[data-bulk="off"]');
  await page.waitForSelector(".grid .card .chk");
  for (const i of [1, 4, 6]) await page.locator(".grid .card").nth(i).click();
  await page.waitForSelector("[data-bulkbar]");
  check("Chọn → checkboxes, 3 selected cards + bulkbar 'Đã chọn 3' / 'Bỏ khỏi danh sách (3)'", (await page.$$(".grid .card.selected")).length === 3 && /Đã chọn 3/.test(await text(page, "[data-bulkbar]")) && (await text(page, '[data-action="bulk-remove"]')) === "Bỏ khỏi danh sách (3)" && (await text(page, '[data-bulk="on"]')) === "Xong");
  await page.click('[data-action="bulk-remove"]');
  await page.waitForFunction(() => document.querySelectorAll(".grid .card").length === 11);
  check("bulk remove → 11 cards, bulk mode off, title updates", (await page.$("[data-bulkbar]")) === null && (await text(page, "main > section:nth-of-type(2) h2")) === "Danh sách của tôi · 11 phim" && (await (await ctx.request.get(BASE + "/api/my-list")).json()).items.length === 11);
  await page.click('[data-action="clear-history"]');
  await page.waitForSelector(".dlg .card2");
  check("'Xoá lịch sử' → dialog '6 phim trong “Tiếp tục xem” sẽ bị xoá…'", /Xoá toàn bộ lịch sử xem\?/.test(await text(page, ".dlg .card2 h3")) && /^6 phim trong/.test(await text(page, ".dlg .card2 p")));
  await page.click('.dlg .acts button:has-text("Xoá lịch sử")');
  await page.waitForSelector(".emptybox");
  check("confirm → empty-continue box 'Chưa có phim đang xem dở' + history cleared server-side", (await text(page, ".emptybox .emptytitle")) === "Chưa có phim đang xem dở" && (await (await ctx.request.get(BASE + "/api/progress/continue")).json()).items.length === 0);
  await seed({ fixture: "my-list", items: [] });
  await goto(page, `${BASE}/my-list`);
  await page.waitForSelector(".emptybox a.btn");
  check("empty list: 'Danh sách của tôi · 0 phim' + 'Danh sách trống' + 'Khám phá phim' → /, continue section hidden", (await text(page, "main h2")) === "Danh sách của tôi · 0 phim" && (await text(page, ".emptybox .emptytitle")) === "Danh sách trống" && (await page.getAttribute(".emptybox a.btn", "href")) === "/" && (await page.$$("main section")).length === 1);

  check("0 console errors on list pages", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));
  await ctx.request.post(BASE + "/api/dev/scenario", { data: { flags: [] } });
  await seed({ fixture: "progress", rows: [] });
  await ctx.close();
  await seeder.dispose();
  await browser.close();
  report.finish();
}

main().catch((err) => { console.error(err); process.exit(1); });
