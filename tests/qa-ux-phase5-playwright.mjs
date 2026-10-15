// Phase 5 player UX checks (Playwright, RUNNING dev server with LUMEN_SCENARIOS=1, local ffmpeg sample + subtitle sim — zero
// OpenSubtitles / SubDL / Kie / TorBox traffic): band + source line, the Âm thanh | Phụ đề popover (7 states via `subs-sim`),
// track switching, `C` cycling, offset / size persistence, keyboard reachability, translate → done toast, mobile, 0 console errors.
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
const IGNORED_CONSOLE = /status of (403|404|410|429|503)|scheme does not have a registered handler|ERR_INTERNET_DISCONNECTED|Failed to load resource: net::ERR_FAILED/;

let seeder;
const seed = (fixture) => seeder.post(BASE + "/api/dev/seed", { data: fixture });
const PLAYING = () => { const v = document.querySelector("video"); return Boolean(v && !v.paused && v.currentTime > 0.3); };
const vid = (page) => page.evaluate(() => { const v = document.querySelector("video"); return v ? { t: v.currentTime, paused: v.paused, vol: v.volume } : null; });
const bandText = (page) => page.$eval(".subs", (el) => el.textContent ?? "");
const bandFont = (page) => page.$eval(".subs", (el) => getComputedStyle(el).fontSize);

async function newCtx(browser, viewport = { width: 1440, height: 900 }, mobile = false) {
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, locale: "vi-VN" });
  const consoleErrors = [];
  ctx.on("page", (p) => {
    p.on("console", (m) => { if (m.type() === "error" && !IGNORED_CONSOLE.test(m.text())) consoleErrors.push(`${p.url()} :: ${m.text().slice(0, 200)}`); });
    p.on("pageerror", (e) => consoleErrors.push(`${p.url()} :: pageerror ${String(e).slice(0, 200)}`));
  });
  const r = await ctx.request.post(BASE + "/api/auth/login", { data: { username: ADMIN.u, password: ADMIN.p, remember: true } });
  if (!r.ok()) { console.error(`admin login failed: ${r.status()}`); process.exit(2); }
  const scenario = (flags) => ctx.request.post(BASE + "/api/dev/scenario", { data: { flags } });
  return { ctx, consoleErrors, scenario };
}
async function playing(ctx, page, query = "") {
  const r = await (await ctx.request.post(BASE + "/api/play/resolve", { data: { mediaKey: MOVIE, auto: true } })).json();
  await page.goto(`${BASE}/watch/${r.streamId}${query}`);
  await page.waitForFunction(PLAYING, null, { timeout: 20000 });
  await page.mouse.move(700, 400);
  return r.streamId;
}
const openPop = async (page) => { await page.mouse.move(700, 400); await page.click('[data-action="cc"]'); await page.waitForSelector('.pop [data-col="subs"] .it'); };
const closePop = async (page) => { await page.keyboard.press("Escape"); await page.waitForSelector(".pop", { state: "detached" }); };
const leave = async (page) => { await page.goto("about:blank"); await sleep(500); };

async function main() {
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  seeder = await request.newContext();
  await seeder.post(BASE + "/api/auth/login", { data: { username: ADMIN.u, password: ADMIN.p, remember: false } });
  await seed({ fixture: "clear-views" });
  await seed({ fixture: "progress", rows: [] });
  await seed({ fixture: "subs", mediaKey: MOVIE });
  const { ctx, consoleErrors, scenario } = await newCtx(browser);
  await scenario(["play-sample", "subs-sim=popover"]);
  const page = await ctx.newPage();

  // ---------------------------------------------------------------- default look: band + source line
  await playing(ctx, page);
  await page.waitForSelector(".subs span");
  check("band shows the vi community cue (2 lines, 32px, bottom 118px) + source line 'Phụ đề: OpenSubtitles · 81k lượt tải'", /Peter, mình cần nói chuyện/.test(await bandText(page)) && (await page.$$eval(".subs br", (b) => b.length)) === 1 && (await bandFont(page)) === "32px" && (await page.$eval(".subs", (el) => getComputedStyle(el).bottom)) === "118px" && (await page.textContent(".sub-src")) === "Phụ đề: OpenSubtitles · 81k lượt tải", await bandText(page));
  await page.mouse.move(5, 5);
  await page.waitForSelector('.player[data-controls="hidden"]', { timeout: 6000 });
  check("controls hidden → band at 60px, source line gone, cue still rendered", (await page.$eval(".subs", (el) => getComputedStyle(el).bottom)) === "60px" && (await page.$(".sub-src")) === null && /Peter/.test(await bandText(page)));

  // ---------------------------------------------------------------- popover (state: popover)
  await openPop(page);
  const items = await page.$$eval('.pop [data-col="subs"] .it', (els) => els.map((e) => `${e.textContent.trim()}${e.classList.contains("on") ? "✓" : ""}`));
  check("popover: two columns (Âm thanh ✓ English · <codec>, single-audio note, direct line) | Phụ đề Tắt · vi ✓ · AI · English, ctrl rows, source line", (await page.$$eval(".pop h4", (h) => h.map((x) => x.textContent).join("|"))) === "Âm thanh|Phụ đề" && /^English · /.test(await page.textContent('.pop [data-col="audio"] .it.on')) && /Bản này chỉ có 1 luồng tiếng/.test(await page.textContent('.pop [data-col="audio"]')) && /Phát trực tiếp từ Torbox · 1080p MP4/.test(await page.textContent('.pop [data-col="audio"]')) && items.join("|") === "Tắt|Tiếng Việt (cộng đồng)✓|Tiếng Việt (Dịch AI)|English" && (await page.textContent('[data-ctrl="offset"]')).includes("Lệch thời gian") && (await page.textContent("[data-offset-value]")) === "0.0s" && (await page.$eval('[data-ctrl="size"] u', (u) => u.textContent)) === "M" && (await page.textContent("[data-source-line]")) === "Phụ đề: OpenSubtitles · 81k lượt tải", items.join("|"));
  check("popover open → band lifted to the top (mockup :has(.pop)), no ＋ AI row while a vi track exists", (await page.$eval(".subs", (el) => getComputedStyle(el).top)) === "90px" && (await page.$("[data-translate]")) === null);
  await page.mouse.move(5, 5);
  await sleep(3500);
  check("popover keeps the controls visible", (await page.getAttribute(".player", "data-controls")) === "visible" && (await page.$(".pop")) !== null);
  // keyboard inside the popover: arrows move focus, volume untouched; Enter selects; Esc closes
  const vol0 = (await vid(page)).vol;
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  const focused = await page.evaluate(() => document.activeElement?.textContent?.trim());
  check("↓ ↓ from the ✓ item moves focus to 'English' (volume untouched), Enter selects it", focused === "English" && Math.abs((await vid(page)).vol - vol0) < 0.01, String(focused));
  await page.keyboard.press("Enter");
  await page.waitForSelector('.pop [data-lang="en"].on');
  await page.evaluate(() => { document.querySelector("video").currentTime = 2; });
  await page.waitForFunction(() => /Peter, we need/.test(document.querySelector(".subs")?.textContent ?? ""), null, { timeout: 8000 }).catch(() => {});
  check("English selected → band renders the English cue at t=2s, band not .ai, source line changes", /Peter, we need to talk/.test(await bandText(page)) && (await page.$(".subs.ai")) === null && (await page.textContent("[data-source-line]")) === "Phụ đề: OpenSubtitles · 25k lượt tải", await bandText(page));
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const tabbed = await page.evaluate(() => document.activeElement?.dataset.action ?? document.activeElement?.className ?? "");
  check("Tab × 2 from 'English' walks through the offset controls (− then +)", tabbed === "offset-plus", tabbed);
  await closePop(page);
  check("Esc closes the popover (player stays)", (await page.$(".player")) !== null && !(await vid(page)).paused);

  // ---------------------------------------------------------------- C cycling: en → Tắt → vi → AI → en
  await page.keyboard.press("c");
  await sleep(300);
  check("C from English → Tắt (band empty, source line gone)", (await bandText(page)) === "" && (await page.$(".sub-src")) === null, await bandText(page));
  await page.keyboard.press("c");
  await page.waitForFunction(() => /Peter, mình/.test(document.querySelector(".subs")?.textContent ?? ""));
  await page.keyboard.press("c");
  await page.waitForSelector(".subs.ai");
  check("C → vi community → vi AI (band .ai + 'Phụ đề: Dịch AI (DeepSeek)')", (await page.textContent(".sub-src")) === "Phụ đề: Dịch AI (DeepSeek)");
  await page.keyboard.press("c");
  await page.waitForFunction(() => /Peter, we need/.test(document.querySelector(".subs")?.textContent ?? "") || !/Peter, mình/.test(document.querySelector(".subs")?.textContent ?? ""));
  check("C → English again", (await page.$(".subs.ai")) === null);

  // ---------------------------------------------------------------- offset + size persist after reload
  await openPop(page);
  await page.click('.pop [data-lang="vi"][data-source="os"]');
  for (let i = 0; i < 5; i++) await page.click('[data-action="offset-plus"]');
  await page.click('[data-size="L"]');
  await sleep(300);
  check("5 × + → '+0.5s'; L underlined; band 40px", (await page.textContent("[data-offset-value]")) === "+0.5s" && (await page.$eval('[data-ctrl="size"] u', (u) => u.textContent)) === "L" && (await bandFont(page)) === "40px");
  const minus = await page.$('[data-action="offset-minus"]');
  const box = await minus.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await sleep(700);
  await page.mouse.up();
  await sleep(200);
  check("long-press − → −0.5 s step (back to 0.0s)", (await page.textContent("[data-offset-value]")) === "0.0s", await page.textContent("[data-offset-value]"));
  await page.click('[data-action="offset-plus"]');
  await sleep(600);
  await page.reload();
  await page.waitForFunction(PLAYING, null, { timeout: 20000 });
  await openPop(page);
  check("after reload: +0.1s, size L, vi community still selected (prefs persisted per title)", (await page.textContent("[data-offset-value]")) === "+0.1s" && (await page.$eval('[data-ctrl="size"] u', (u) => u.textContent)) === "L" && (await page.$('.pop [data-lang="vi"][data-source="os"].on')) !== null, await page.textContent("[data-offset-value]"));
  await page.click('[data-size="M"]');
  await page.click('[data-action="offset-minus"]');
  await closePop(page);
  await leave(page);

  // ---------------------------------------------------------------- translate: none → running → done toast → AI track selected
  await seed({ fixture: "subs", mediaKey: MOVIE });
  await scenario(["play-sample", "subs-sim=popover-none"]);
  await playing(ctx, page);
  await openPop(page);
  check("popover-none: Tắt ✓, English, ＋ Dịch sang tiếng Việt bằng AI + '~15 giây · khoảng 500đ', band empty", (await page.$('.pop [data-track="off"].on')) !== null && (await page.textContent('[data-translate="idle"]')).includes("＋ Dịch sang tiếng Việt bằng AI") && (await page.textContent('[data-translate="idle"] small')) === "~15 giây · khoảng 500đ" && (await bandText(page)) === "");
  await page.click('[data-action="translate"]');
  await page.waitForSelector('[data-translate="running"] .mini i', { state: "attached" });
  check("＋ → '⟳ Đang dịch sang tiếng Việt… N%' row with .mini bar, English ✓ shown meanwhile (local only)", /⟳ Đang dịch sang tiếng Việt… \d+%/.test(await page.textContent('[data-translate="running"]')) && (await page.$('.pop [data-lang="en"].on')) !== null);
  await page.waitForSelector(".toasts .toast", { timeout: 30000 });
  await page.waitForSelector('.pop [data-source="ai"].on', { timeout: 10000 });
  check("done → toast 'Phụ đề AI đã sẵn sàng', 'Tiếng Việt (Dịch AI)' listed + selected, band .ai", (await page.textContent(".toasts .toast")).includes("Phụ đề AI đã sẵn sàng") && (await page.textContent('.pop [data-source="ai"]')) === "Tiếng Việt (Dịch AI)" && (await page.$(".subs.ai")) !== null && (await page.$("[data-translate]")) === null);
  await closePop(page);
  await leave(page);

  // ---------------------------------------------------------------- translate failed (kie-down) + Thử lại; quota; none-en
  await seed({ fixture: "subs", mediaKey: MOVIE });
  await scenario(["play-sample", "subs-sim=popover-translate-failed", "kie-down"]);
  await playing(ctx, page);
  await openPop(page);
  await page.click('[data-action="translate"]');
  await page.waitForSelector('[data-translate="error"]', { timeout: 15000 });
  check("kie-down → '✕ Dịch lỗi (DeepSeek không phản hồi) · Thử lại' (red); the interim English is dropped → selection back to Tắt (nothing persisted)", (await page.textContent('[data-translate="error"]')).startsWith("✕ Dịch lỗi (DeepSeek không phản hồi) · ") && (await page.$eval('[data-translate="error"]', (el) => getComputedStyle(el).color)) === "rgb(240, 160, 160)" && (await page.$('.pop [data-track="off"].on')) !== null && (await page.$('.pop [data-lang="en"].on')) === null);
  const jobBefore = (await (await ctx.request.get(`${BASE}/api/subs/search?mediaKey=${MOVIE}`)).json()).job?.jobId;
  await page.click('[data-action="retry-translate"]');
  await page.waitForSelector('[data-translate="running"], [data-translate="error"]');
  await page.waitForSelector('[data-translate="error"]', { timeout: 15000 });
  const jobAfter = (await (await ctx.request.get(`${BASE}/api/subs/search?mediaKey=${MOVIE}`)).json()).job?.jobId;
  check("Thử lại resumes the SAME job (same jobId) → error again under kie-down, error row back", typeof jobBefore === "string" && jobAfter === jobBefore, `${jobBefore} → ${jobAfter}`);
  await page.reload();
  await page.waitForFunction(PLAYING, null, { timeout: 20000 });
  await openPop(page);
  check("after reload with a failed job: Tắt ✓ (English was never written to prefs), error row still shown", (await page.$('.pop [data-track="off"].on')) !== null && (await page.$('[data-translate="error"]')) !== null);
  await closePop(page);
  await leave(page);
  await seed({ fixture: "subs", mediaKey: MOVIE });
  await scenario(["play-sample", "subs-sim=popover-quota", "os-quota-zero"]);
  await playing(ctx, page);
  await openPop(page);
  const qItems = await page.$$eval('.pop [data-col="subs"] .it', (els) => els.map((e) => `${e.textContent.trim()}${e.disabled ? "⛔" : ""}`));
  check("quota: OS vi greyed 🔒 (disabled, opacity .45), SubDL vi/en active, amber note '… đặt lại sau 22 giờ …'", qItems.join("|") === "Tắt|Tiếng Việt (OpenSubtitles) 🔒⛔|Tiếng Việt (SubDL)|English (SubDL)" && (await page.$eval(".pop .it.locked", (el) => getComputedStyle(el).opacity)) === "0.45" && (await page.textContent("[data-quota-note]")) === "Hết lượt tải OpenSubtitles hôm nay (20/20), đặt lại sau 22 giờ. Nguồn SubDL vẫn dùng được." && (await page.$eval("[data-quota-note]", (el) => getComputedStyle(el).color)) === "rgb(240, 215, 155)", qItems.join("|"));
  await closePop(page);
  await leave(page);
  await scenario(["play-sample", "subs-sim=popover-none-en"]);
  await playing(ctx, page);
  await openPop(page);
  check("none-en: note + 'Chọn bản khác có phụ đề', no ＋ row", (await page.textContent("[data-none-note]")) === "Không có phụ đề cho bản này. Không có phụ đề tiếng Anh để dịch." && (await page.$('[data-action="pick-other"]')) !== null && (await page.$("[data-translate]")) === null);
  await page.click('[data-action="pick-other"]');
  await page.waitForURL(/\/movie\/634649\?pick=1/, { timeout: 15000 });
  check("'Chọn bản khác có phụ đề' → detail page with the picker", /pick=1/.test(page.url()));
  await leave(page);

  // ---------------------------------------------------------------- mobile: stacked columns, 20px band, source line hidden
  const m = await newCtx(browser, { width: 390, height: 844 }, true);
  await m.scenario(["play-sample", "subs-sim=popover"]);
  await seed({ fixture: "subs", mediaKey: MOVIE });
  const mp = await m.ctx.newPage();
  await playing(m.ctx, mp);
  await mp.waitForSelector(".subs span");
  check("mobile: band 19px (mockup), source line hidden", (await bandFont(mp)) === "19px" && (await mp.$eval(".sub-src", (el) => getComputedStyle(el).display)) === "none");
  await mp.tap('[data-action="cc"]').catch(() => mp.click('[data-action="cc"]'));
  await mp.waitForSelector('.pop [data-col="subs"] .it');
  const popBox = await mp.$eval(".pop", (el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: window.innerWidth - r.right, dir: getComputedStyle(el).flexDirection }; });
  check("mobile popover: stacked columns, 10px from both edges", popBox.dir === "column" && popBox.left === 10 && popBox.right === 10, JSON.stringify(popBox));
  await leave(mp);
  await m.ctx.close();

  check("0 console errors across the run", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" || "));
  await scenario([]);
  await seed({ fixture: "subs", mediaKey: MOVIE });
  await ctx.close();
  await browser.close();
  report.finish();
}

main().catch((err) => { console.error(err); process.exit(1); });
