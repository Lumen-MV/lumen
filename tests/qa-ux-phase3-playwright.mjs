// Phase 3 UX checks (Playwright, RUNNING dev server with LUMEN_SCENARIOS=1): detail primary states, picker filter/sort/4K/keyboard,
// cloud job via the dev fake TorBox (toast, live progress, completion → Phát + bell), cancel dialog, mobile sheet, logout confirm,
// 0 console errors. Admin creds from .env.local (never printed). No real download is ever started.   node tests/qa-ux-phase3-playwright.mjs [--base …]
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
const MOVIE = `${BASE}/movie/634649`;
const ROW = ".modal .box .src[data-hash]";

let seeder;
const seed = async (fixture) => (await seeder.post(BASE + "/api/dev/seed", { data: fixture })).json().catch(() => ({}));

async function newCtx(browser, viewport = { width: 1440, height: 900 }, mobile = false) {
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, locale: "vi-VN" });
  const consoleErrors = [];
  ctx.on("page", (p) => {
    // the deliberate torbox-down (503) / not-found (404) answers are logged by the browser itself; everything else counts
    p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource: the server responded with a status of (404|503)/.test(m.text())) consoleErrors.push(`${p.url()} :: ${m.text().slice(0, 200)}`); });
    p.on("pageerror", (e) => consoleErrors.push(`${p.url()} :: pageerror ${String(e).slice(0, 200)}`));
  });
  const r = await ctx.request.post(BASE + "/api/auth/login", { data: { username: ADMIN.u, password: ADMIN.p, remember: true } });
  if (!r.ok()) { console.error(`admin login failed: ${r.status()}`); process.exit(2); }
  await ctx.request.post(BASE + "/api/dev/scenario", { data: { flags: [] } });
  await ctx.request.patch(BASE + "/api/me/settings", { data: { show_4k: false } });
  return { ctx, consoleErrors, scenario: (flags) => ctx.request.post(BASE + "/api/dev/scenario", { data: { flags } }) };
}

async function goto(page, url) {
  try { await page.goto(url); } catch (e) { if (!/ERR_ABORTED/.test(String(e))) throw e; await page.goto(url); }
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
}
const openPicker = async (page) => { await page.waitForSelector('[data-primary]:not([data-primary="loading"])', { timeout: 30000 }); await page.click('[data-action="pick-other"]'); await page.waitForSelector(ROW); };

async function main() {
  const browser = await chromium.launch();
  seeder = await request.newContext();
  await seeder.post(BASE + "/api/auth/login", { data: { username: ADMIN.u, password: ADMIN.p, remember: false } });
  await seed({ fixture: "clear-cloud-jobs" });
  await seed({ fixture: "clear-notifications" });
  const { ctx, consoleErrors, scenario } = await newCtx(browser);
  const page = await ctx.newPage();

  // ---------------------------------------------------------------- detail: loading → direct primary, facts, best
  await goto(page, MOVIE);
  await page.waitForSelector('[data-primary="direct"]', { timeout: 30000 });
  check("primary ▶ Phát · 1080p + green facts + best label", /^▶ Phát · 1080p$/.test((await page.textContent('[data-primary="direct"]')).trim()) && (await page.$('.facts .match[data-facts="direct"]')) !== null && /1080p .+ · .+ GB · /.test(await page.textContent("[data-best]")));

  // ---------------------------------------------------------------- picker: open, rows, filter, sort, keyboard, Esc
  await openPicker(page);
  const n = (await page.$$(ROW)).length;
  check("picker opens with ≥ 8 rows and a .rec row", n >= 8 && (await page.$(".modal .src.rec")) !== null, `rows=${n}`);
  check("picker title", (await page.textContent(".modal .box .hd h3")).startsWith("Chọn nguồn phát · "));
  await page.click('.modal .filt [data-filter="direct"]');
  await sleep(100);
  check("filter Phát trực tiếp → only direct rows", (await page.$$eval(ROW, (els) => els.every((e) => e.dataset.play === "direct"))) && (await page.$$(ROW)).length > 0);
  await page.click('.modal .filt [data-filter="all"]');
  await page.click(".modal .filt .sort");
  await page.click('.menu2 [role="menuitem"]:has-text("Dung lượng")');
  await sleep(100);
  const sizes = await page.$$eval(`${ROW} .l1`, (els) => els.map((e) => Number((e.textContent.match(/([\d.]+) GB/) || [])[1] || 0)));
  check("sort menu → Dung lượng → descending sizes", (await page.getAttribute(".modal .filt .sort", "data-sort")) === "size" && sizes.every((v, i) => i === 0 || v <= sizes[i - 1]), sizes.slice(0, 5).join(","));
  await page.click(".modal .filt .sort");
  await page.click('.menu2 [role="menuitem"]:has-text("Đề xuất")');
  check("sort menu → back to Đề xuất", (await page.getAttribute(".modal .filt .sort", "data-sort")) === "recommended");
  const first = await page.getAttribute(`${ROW} >> nth=0`, "data-hash");
  check("recommended row highlighted on open", (await page.$(`.modal .src.on[data-hash="${first}"]`)) !== null);
  await page.keyboard.press("ArrowDown");
  const second = await page.getAttribute(`${ROW} >> nth=1`, "data-hash");
  check("ArrowDown moves highlight", (await page.$(`.modal .src.on[data-hash="${second}"]`)) !== null);
  await page.keyboard.press("ArrowUp");
  check("ArrowUp moves back", (await page.$(`.modal .src.on[data-hash="${first}"]`)) !== null);
  await page.keyboard.press("Escape");
  check("Esc closes the picker", (await page.waitForSelector(".modal", { state: "detached" })) === null);

  // ---------------------------------------------------------------- 4K toggle persists
  await openPicker(page);
  await page.click('[data-toggle="4k"]');
  await page.waitForSelector(`${ROW} .q:has-text("2160p")`, { timeout: 30000 });
  check("4K toggle → 2160p rows shown (order stays score-based: first row still 1080p cached) + show_4k persisted", (await (await ctx.request.get(BASE + "/api/me")).json()).settings?.show_4k === true && /1080p/.test(await page.textContent(`${ROW} >> nth=0 >> .q`)));
  await page.click('[data-toggle="4k"]');
  await page.waitForFunction(() => !document.querySelector(".modal .box .src[data-hash] .q")?.textContent.includes("2160p"), null, { timeout: 30000 });
  await page.keyboard.press("Escape");

  // ---------------------------------------------------------------- Enter = primary action on the highlighted row (resolve → /watch)
  if (process.env.QA_SKIP_REAL === "1") report.note("QA_SKIP_REAL=1: Enter → real resolve → /watch skipped (2 checks)");
  else {
    await openPicker(page);
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/watch\/[0-9a-f]{32}$/, { timeout: 20000 });
    check("Enter on a cached direct row resolves and navigates to /watch/[streamId]", /\/watch\/[0-9a-f]{32}$/.test(page.url()));
    check("/watch placeholder carries no CDN URL", !(await page.content()).includes("tb-cdn") && (await page.$("[data-stream-id]")) !== null);
  }

  // ---------------------------------------------------------------- cloud job (fake TorBox): toast, live progress, completion
  await scenario(["all-uncached", "cloud-sim=downloading:40:30"]);
  await goto(page, MOVIE);
  await page.waitForSelector('[data-primary="uncached"]', { timeout: 30000 });
  check("all-uncached → primary ⬇ Tải lên cloud · 1080p", (await page.textContent('[data-primary="uncached"]')).startsWith("⬇ Tải lên cloud"));
  await page.click('[data-primary="uncached"]');
  await page.waitForSelector(".modal .banner.info");
  check("primary (uncached) opens the picker with the info banner + highlighted best", (await page.$(".modal .src.on")) !== null);
  const target = await page.getAttribute(`${ROW} >> nth=0`, "data-hash");
  await page.click(`${ROW}[data-hash="${target}"] [data-action="cloud"]`);
  await page.waitForSelector(`${ROW}[data-hash="${target}"][data-job="downloading"]`);
  check("⬇ Tải lên cloud → row downloading + toast ℹ", (await page.$(".toasts .toast.info")) !== null && /Đang tải 40%/.test(await page.textContent(`${ROW}[data-hash="${target}"] .l1`)));
  check("Huỷ button + ~N phút eta", (await page.$(`${ROW}[data-hash="${target}"] [data-action="cancel"]`)) !== null && /~\d+ phút/.test(await page.textContent(`${ROW}[data-hash="${target}"] .l1`)));
  const progressed = await page.waitForFunction((h) => /Đang tải (70|100)%/.test(document.querySelector(`.modal .src[data-hash="${h}"] .l1`)?.textContent ?? ""), target, { timeout: 15000 }).then(() => true).catch(() => false);
  const completed = await page.waitForSelector(`${ROW}[data-hash="${target}"][data-cache="cached"]:not([data-job])`, { timeout: 30000 }).then(() => true).catch(() => false);
  check("progress updates live while the picker is open, then completes", progressed && completed, `progressed=${progressed} completed=${completed}`);
  check("completion → row becomes cached with ▶ Phát + highlighted", (await page.$(`${ROW}[data-hash="${target}"] [data-action="play"]`)) !== null && (await page.$(`.modal .src.on[data-hash="${target}"]`)) !== null);
  await page.keyboard.press("Escape");
  await page.click(".hicons .bell-wrap");
  await page.waitForSelector(".notif .it.unread"); // `.it` alone also matches the transient "…" loading row
  check("bell shows 'Bản … đã sẵn sàng để xem'", /đã sẵn sàng để xem/.test(await page.textContent(".notif")));
  await page.keyboard.press("Escape");

  // ---------------------------------------------------------------- cancel dialog
  await seed({ fixture: "clear-cloud-jobs" });
  await scenario(["all-uncached", "cloud-sim=downloading:73"]);
  await goto(page, MOVIE);
  await openPicker(page);
  await page.click(`${ROW} >> nth=1 >> [data-action="cloud"]`);
  await page.waitForSelector(`${ROW}[data-job="downloading"]`);
  await page.click(`${ROW}[data-job="downloading"] [data-action="cancel"]`);
  await page.waitForSelector(".dlg .card2");
  check("cancel dialog Dừng tải bản này? with file + 73 %", /Dừng tải bản này\?/.test(await page.textContent(".dlg .card2 h3")) && /\(73%\)/.test(await page.textContent(".dlg .card2 p")));
  await page.click('.dlg .card2 .acts button:has-text("Tiếp tục tải")');
  check("Tiếp tục tải keeps the job", (await page.waitForSelector(".dlg", { state: "detached" })) === null && (await page.$(`${ROW}[data-job="downloading"]`)) !== null);
  await page.click(`${ROW}[data-job="downloading"] [data-action="cancel"]`);
  await page.click('.dlg .card2 .acts button:has-text("Dừng")');
  await page.waitForSelector(`${ROW}[data-job="downloading"]`, { state: "detached" });
  check("Dừng cancels → row back to uncached", (await page.$$(`${ROW}[data-job]`)).length === 0);
  await page.keyboard.press("Escape");
  await scenario([]);

  // ---------------------------------------------------------------- torbox-down + empty states
  await scenario(["torbox-down"]);
  await goto(page, MOVIE);
  await openPicker(page);
  check("torbox-down → err banner + dimmed rows + Thử lại", (await page.$(".modal .banner.err")) !== null && (await page.$(".modal .src.dim")) !== null && (await page.$('.modal .banner.err button:has-text("Thử lại")')) !== null);
  await page.keyboard.press("Escape");
  await scenario([]);
  await page.route("**/api/sources?*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ releases: [], best: null, state: "empty", slots: { active: 0, limit: 6 } }) }));
  await goto(page, MOVIE);
  await page.waitForSelector('[data-primary="none"]');
  check("no sources → disabled primary with tooltip", (await page.getAttribute('[data-primary="none"]', "title")) === "Thử tìm lại sau hoặc chọn phim khác" && (await page.isDisabled('[data-primary="none"]')));
  await page.click('[data-action="pick-other"]');
  await page.waitForSelector("[data-picker-empty]");
  check("empty picker: Thử lại + Yêu cầu thêm phim này", (await page.$('[data-picker-empty] button:has-text("Yêu cầu thêm phim này")')) !== null);
  await page.unrouteAll({ behavior: "wait" });
  await page.keyboard.press("Escape");

  // ---------------------------------------------------------------- series: chips + ⋯ menu + episode picker
  await goto(page, `${BASE}/series/66732?s=4`);
  await page.waitForSelector('.eps .ep[data-episode="1"] .tag', { timeout: 30000 });
  check("episode chips from title_sources (E1 known)", /Đã cache|Chưa cache/.test(await page.textContent('.eps .ep[data-episode="1"] .tag')));
  await page.click('[data-episode-menu="2"]');
  await page.waitForSelector(".menu2");
  check("⋯ menu entries", (await page.textContent(".menu2")).includes("⬇ Tải lên cloud") && (await page.textContent(".menu2")).includes("Chọn bản khác"));
  await page.click('.menu2 [role="menuitem"]:has-text("Chọn bản khác")');
  await page.waitForSelector(ROW, { timeout: 30000 });
  check("episode picker for S4 T2", (await page.textContent(".modal .box .hd h3")) === "Chọn nguồn · S4 T2" && /Trọn mùa 4|Tập 2/.test(await page.textContent(`${ROW} >> nth=0`)));
  await page.keyboard.press("Escape");

  // ---------------------------------------------------------------- logout confirm with an active job
  await seed({ fixture: "cloud-jobs", mediaKey: "movie:533535", title: "Deadpool & Wolverine", jobs: [{ hash: "d".repeat(40), state: "downloading", progress: 73 }] });
  await goto(page, BASE + "/");
  await page.click("header .avatar");
  await page.click('.menu2 [role="menuitem"]:has-text("Đăng xuất")');
  await page.waitForSelector(".dlg .card2");
  check("logout confirm names the job + 73 %", /Deadpool & Wolverine/.test(await page.textContent(".dlg .card2 p")) && /\(73%\)/.test(await page.textContent(".dlg .card2 p")));
  await page.click('.dlg .card2 .acts button:has-text("Ở lại")');
  await page.waitForSelector(".dlg", { state: "detached" });
  check("Ở lại keeps the session", page.url() === BASE + "/" && (await page.$("header .avatar")) !== null);
  check("home hero/cards carry cache markers", (await page.$$(".card .cdot")).length > 0);
  await seed({ fixture: "clear-cloud-jobs" });

  // ---------------------------------------------------------------- mobile bottom sheet
  const m = await newCtx(browser, { width: 390, height: 844 }, true);
  const mp = await m.ctx.newPage();
  await goto(mp, MOVIE);
  await openPicker(mp);
  const box = await mp.$eval(".modal .box", (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return { width: r.width, bottom: r.bottom, radius: cs.borderTopLeftRadius }; });
  check("≤ 700 px: bottom sheet (full width, rounded top, flush bottom)", box.width === 390 && Math.abs(box.bottom - 844) < 2 && box.radius !== "8px", JSON.stringify(box));
  await mp.keyboard.press("Escape");
  await m.ctx.close();

  check("0 console errors on Phase-3 pages", consoleErrors.length === 0 && m.consoleErrors.length === 0, [...consoleErrors, ...m.consoleErrors].slice(0, 3).join(" | "));
  await ctx.close();
  await seeder.dispose();
  await browser.close();
  report.finish();
}

main().catch((err) => { console.error(err); process.exit(1); });
