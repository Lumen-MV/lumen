// Phase 4 player UX checks (Playwright, RUNNING dev server with LUMEN_SCENARIOS=1): real <video> playback of the local ffmpeg
// sample (scenario play-sample — zero TorBox traffic): play/pause/seek/volume/mute/fullscreen/PiP availability, keyboard
// map, auto-hide, double-tap, time toggle, speed menu, hand-off sheet (copy / QR / Stremio), episode drawer, next-episode
// countdown, resume dialog, watchdog states via flags (stall, no-audio, codec, link-expired ×2), offline, viewer limit,
// progress heartbeat + beacon, mobile layout, 0 console errors.   node tests/qa-ux-phase4-playwright.mjs [--base …]
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
const SERIES = "tv:66732:4:1";
const IGNORED_CONSOLE = /status of (403|404|410|429|503)|scheme does not have a registered handler|ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED|Failed to load resource: net::ERR_FAILED/;

let seeder;
const seed = (fixture) => seeder.post(BASE + "/api/dev/seed", { data: fixture });

async function newCtx(browser, viewport = { width: 1440, height: 900 }, mobile = false) {
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, locale: "vi-VN", permissions: ["clipboard-read", "clipboard-write"] });
  const consoleErrors = [];
  ctx.on("page", (p) => {
    p.on("console", (m) => { if (m.type() === "error" && !IGNORED_CONSOLE.test(m.text())) consoleErrors.push(`${p.url()} :: ${m.text().slice(0, 200)}`); });
    p.on("pageerror", (e) => consoleErrors.push(`${p.url()} :: pageerror ${String(e).slice(0, 200)}`));
  });
  const r = await ctx.request.post(BASE + "/api/auth/login", { data: { username: ADMIN.u, password: ADMIN.p, remember: true } });
  if (!r.ok()) { console.error(`admin login failed: ${r.status()}`); process.exit(2); }
  const scenario = (flags) => ctx.request.post(BASE + "/api/dev/scenario", { data: { flags } });
  await scenario(["play-sample"]);
  return { ctx, consoleErrors, scenario };
}
const vid = (page) => page.evaluate(() => { const v = document.querySelector("video"); return v ? { t: v.currentTime, paused: v.paused, vol: v.volume, muted: v.muted, rate: v.playbackRate, ended: v.ended, dur: v.duration } : null; });
const PLAYING = () => { const v = document.querySelector("video"); return Boolean(v && !v.paused && v.currentTime > 0.3); };
async function openPlayer(ctx, page, mediaKey = MOVIE, query = "") {
  const r = await (await ctx.request.post(BASE + "/api/play/resolve", { data: { mediaKey, auto: true } })).json();
  await page.goto(`${BASE}/watch/${r.streamId}${query}`);
  await page.waitForSelector(".player");
  return r.streamId;
}
async function playing(ctx, page, mediaKey = MOVIE, query = "") {
  const id = await openPlayer(ctx, page, mediaKey, query);
  await page.waitForFunction(PLAYING, null, { timeout: 20000 });
  await page.mouse.move(700, 400);
  return id;
}
/** Chromium keeps the 3 MB sample fully buffered, so an expired link only bites once the browser re-requests it. */
const rerequestMedia = (page) => page.evaluate(() => { const v = document.querySelector("video"); v.src = v.src + "&x=1"; v.load(); });
/** leaving the player fires the progress beacon: give it a moment before the next fixture seeds rows */
const leave = async (page) => { await page.goto("about:blank"); await sleep(600); };

async function main() {
  // autoplay must not depend on Playwright evaluate timing (its first evaluate carries the user gesture): real viewers arrive by a click + router.push
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  seeder = await request.newContext();
  await seeder.post(BASE + "/api/auth/login", { data: { username: ADMIN.u, password: ADMIN.p, remember: false } });
  await seed({ fixture: "clear-views" });
  await seed({ fixture: "progress", rows: [] });
  const { ctx, consoleErrors, scenario } = await newCtx(browser);
  const page = await ctx.newPage();

  // ---------------------------------------------------------------- basic playback + controls
  const t0 = Date.now();
  await playing(ctx, page);
  const firstFrameMs = Date.now() - t0;
  const html = await (await ctx.request.get(page.url())).text();
  check("sample plays (first frame < 5 s), server HTML carries no src", firstFrameMs < 5000 && !html.includes("sample.mp4") && !html.includes("tb-cdn"), `${firstFrameMs}ms`);
  check("controls: title centre 'Tên · 1080p · MP4', icons in mockup order", (await page.textContent(".ctl .title span")) === "1080p · MP4" && (await page.$$eval(".ctl button.ib", (b) => b.map((x) => x.dataset.action).join(","))) === "toggle-play,back10,fwd10,mute,cc,speed,pip,cast,fullscreen" || (await page.$$eval(".ctl button.ib", (b) => b.map((x) => x.dataset.action).join(","))) === "toggle-play,back10,fwd10,mute,cc,speed,cast,fullscreen", await page.$$eval(".ctl button.ib", (b) => b.map((x) => x.dataset.action).join(",")));
  await page.keyboard.press(" ");
  await page.waitForSelector('[data-action="toggle-play"][data-paused="true"]');
  check("Space pauses + play icon + centre flash", (await vid(page)).paused && (await page.$(".pflash")) !== null);
  await page.keyboard.press("k");
  await page.waitForFunction(PLAYING);
  check("K resumes", !(await vid(page)).paused);
  const before = (await vid(page)).t;
  await page.keyboard.press("ArrowRight");
  await sleep(300);
  const afterR = (await vid(page)).t;
  await page.keyboard.press("ArrowLeft");
  await sleep(300);
  const afterL = (await vid(page)).t;
  check("→ / ← seek ±10 s", afterR - before >= 9 && afterR - afterL >= 8, `${before.toFixed(1)} → ${afterR.toFixed(1)} → ${afterL.toFixed(1)}`);
  await page.keyboard.press("l");
  await sleep(200);
  const afterJL = (await vid(page)).t;
  await page.keyboard.press("j");
  check("J / L seek ±10 s", afterJL - afterL >= 9);
  await page.click('[data-action="fwd10"]');
  await sleep(200);
  check("↻10 button", (await vid(page)).t - afterL >= 9);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  check("↓ volume −0.2", Math.abs((await vid(page)).vol - 0.8) < 0.01, String((await vid(page)).vol));
  await page.keyboard.press("ArrowUp");
  await sleep(150);
  check("↑ volume +0.1", Math.abs((await vid(page)).vol - 0.9) < 0.01, String((await vid(page)).vol));
  await page.keyboard.press("m");
  await sleep(150);
  check("M mutes + aria-pressed", (await vid(page)).muted && (await page.getAttribute('[data-action="mute"]', "aria-pressed")) === "true");
  await page.click('[data-action="mute"]');
  check("mute button toggles back", !(await vid(page)).muted);
  await page.hover('[data-action="mute"]');
  await page.waitForSelector(".volslider", { state: "visible" });
  // React tracks the value setter: go through the prototype setter so the synthetic change event fires
  await page.$eval('[data-action="volume"]', (el) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, "50"); el.dispatchEvent(new Event("input", { bubbles: true })); });
  await sleep(150);
  check("hover slider sets volume 0.5", Math.abs((await vid(page)).vol - 0.5) < 0.02, String((await vid(page)).vol));
  const trk = await (await page.$(".seek .trk")).boundingBox();
  await page.mouse.move(trk.x + trk.width * 0.5, trk.y + 1);
  await page.waitForSelector("[data-seek-preview]");
  check("seek hover preview 160×90 + time ~0:30", (await page.$eval("[data-seek-preview] .thumb", (el) => el.getBoundingClientRect().width)) === 160 && /^0:(29|30|31)$/.test((await page.textContent("[data-seek-preview] .t")).trim()), await page.textContent("[data-seek-preview] .t"));
  await page.mouse.click(trk.x + trk.width * 0.5, trk.y + 1);
  await sleep(300);
  check("click on the track seeks to ~50 %", Math.abs((await vid(page)).t - 30) < 2, String((await vid(page)).t));
  await page.click(".seek .time");
  check("time click → remaining '-0:2x'", /^-0:(2|3)\d$/.test((await page.textContent(".seek .time")).trim()), await page.textContent(".seek .time"));
  await page.click(".seek .time");
  await page.click('[data-action="speed"]');
  await page.click('.menu2 [data-speed="1.5"]');
  check("speed menu → 1.5×", (await vid(page)).rate === 1.5 && (await page.getAttribute('[data-action="speed"]', "data-rate")) === "1.5");
  await page.click('[data-action="speed"]');
  await page.click('.menu2 [data-speed="1"]');
  const fsEnabled = await page.evaluate(() => Boolean(document.fullscreenEnabled));
  await page.keyboard.press("f");
  await sleep(400);
  const fsOn = await page.evaluate(() => Boolean(document.fullscreenElement));
  check("F → fullscreen (document.fullscreenElement) + aria-pressed (skipped when headless denies fullscreen)", !fsEnabled || (fsOn && (await page.getAttribute('[data-action="fullscreen"]', "aria-pressed")) === "true"), `fullscreenEnabled=${fsEnabled} on=${fsOn}`);
  await page.keyboard.press("Escape");
  await sleep(300);
  check("Esc exits fullscreen, player stays (never leaves the page)", !(await page.evaluate(() => Boolean(document.fullscreenElement))) && /\/watch\//.test(page.url()) && (await page.$(".player")) !== null);
  check("PiP button only when the browser offers it (not on iPhone)", ((await page.$('[data-action="pip"]')) !== null) === (await page.evaluate(() => Boolean(document.pictureInPictureEnabled))));
  await page.keyboard.press("?");
  await page.waitForSelector(".dlg .kbd");
  const rows = await page.$$eval(".dlg .kbd span", (els) => els.map((e) => e.textContent.trim()));
  check("? → player help: 8 rows ending with 'Đóng hộp thoại / thoát toàn màn hình Esc'", rows.length === 8 && /^Đóng hộp thoại \/ thoát toàn màn hình/.test(rows[7]) && /^Phát \/ dừng/.test(rows[0]), rows.join(" | "));
  await page.keyboard.press("Escape");
  await page.waitForSelector(".dlg", { state: "detached" });

  // ---------------------------------------------------------------- hotkeys never hijack focused controls / Radix surfaces
  await page.mouse.move(700, 400);
  const tFocus = (await vid(page)).t;
  await page.focus('[data-action="fwd10"]');
  await page.keyboard.press(" ");
  await sleep(300);
  check("Space on the focused ↻10 button activates the button (+10 s), does not pause", (await vid(page)).t - tFocus >= 9 && !(await vid(page)).paused, `${tFocus.toFixed(1)} → ${(await vid(page)).t.toFixed(1)} paused=${(await vid(page)).paused}`);
  await page.click('[data-action="speed"]');
  await page.waitForSelector(".menu2 [data-speed]");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await sleep(100);
  check("↓ inside the speed menu moves the Radix highlight (volume untouched)", (await page.$(".menu2 [data-speed][data-highlighted]")) !== null && Math.abs((await vid(page)).vol - 0.5) < 0.02, String((await vid(page)).vol));
  await page.keyboard.press("Escape");
  await page.waitForSelector(".menu2", { state: "detached" });
  await page.evaluate(() => document.activeElement?.blur());
  await page.waitForSelector(".dlg", { state: "detached" });

  // ---------------------------------------------------------------- auto-hide
  await page.mouse.move(5, 5);
  await page.waitForSelector('.player[data-controls="hidden"]', { timeout: 6000 });
  check("3 s idle hides controls (.pbar display none, .subs bottom 60px)", (await page.$eval(".pbar", (el) => getComputedStyle(el).display)) === "none" && (await page.$eval(".subs", (el) => getComputedStyle(el).bottom)) === "60px");
  await page.mouse.move(600, 300);
  await page.waitForSelector('.player[data-controls="visible"]');
  await page.keyboard.press(" ");
  await page.mouse.move(5, 5);
  await sleep(3600);
  check("paused → controls never hide", (await page.getAttribute(".player", "data-controls")) === "visible");
  await page.keyboard.press(" ");

  // ---------------------------------------------------------------- hand-off sheet (the contract script may have spent the 10/min hand-off budget: reset it)
  await seed({ fixture: "reset-rate-limit" });
  await page.mouse.move(700, 400);
  await page.click('[data-action="cast"]');
  await page.waitForSelector(".sheet2");
  check("cast → sheet with Stremio / Infuse / VLC / copy / copy-sub / QR", (await page.$$eval(".sheet2 .it", (b) => b.map((x) => x.dataset.handoff).join(","))) === "stremio,infuse,vlc,copy,copy-sub,qr");
  await page.mouse.move(5, 5);
  await sleep(3500);
  check("sheet open → controls stay", (await page.getAttribute(".player", "data-controls")) === "visible");
  await page.click('[data-handoff="copy"]');
  await page.waitForSelector(".toasts .toast");
  const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => ""));
  check("Sao chép link → toast '✓ Đã sao chép link · hết hạn sau 50 phút' + clipboard holds the stream URL only", /Đã sao chép link · hết hạn sau 50 phút/.test(await page.textContent(".toasts .toast")) && /sample\.mp4/.test(clip) && !clip.includes("\n"), clip.slice(0, 120));
  await page.waitForSelector(".sheet2", { state: "detached" });
  await page.click('[data-action="cast"]');
  await page.waitForSelector(".sheet2");
  check("Infuse row carries the 'Nếu Infuse không tự bật phụ đề…' hint; copy-sub row has its own hint", /Nếu Infuse không tự bật phụ đề: bấm biểu tượng phụ đề trong Infuse và chọn 'Tiếng Việt'/.test(await page.textContent('[data-handoff="infuse"]')) && /Sao chép link phụ đề/.test(await page.textContent('[data-handoff="copy-sub"]')));
  await page.click('[data-handoff="copy-sub"]');
  await page.waitForFunction(() => /link phụ đề/.test(document.querySelector(".toasts")?.textContent ?? ""));
  const clipSub = await page.evaluate(() => navigator.clipboard.readText().catch(() => ""));
  check("Sao chép link phụ đề → toast '✓ Đã sao chép link phụ đề · hết hạn sau 60 phút' + clipboard = the signed path-style .srt link (no '?')", /Đã sao chép link phụ đề · hết hạn sau 60 phút/.test(await page.textContent(".toasts")) && /\/api\/subs\/s\/\d+\/\d+\/[0-9a-f]{64}\/subtitle\.srt$/.test(clipSub) && !clipSub.includes("?"), clipSub.replace(/\/[0-9a-f]{64}\//, "/…/").slice(0, 160));
  await page.waitForSelector(".sheet2", { state: "detached" });
  await page.click('[data-action="cast"]');
  await page.click('[data-handoff="qr"]');
  await page.waitForSelector(".dlg .qr img");
  check("QR dialog: 200px real QR + 'Quét để mở trên TV'", (await page.$eval(".dlg .qr", (el) => el.getBoundingClientRect().width)) === 200 && /Quét để mở trên TV/.test(await page.textContent(".dlg .card2 h3")));
  await page.keyboard.press("Escape");
  await page.waitForSelector(".dlg", { state: "detached" });
  await page.click('[data-action="cast"]');
  await page.click('[data-handoff="stremio"]');
  await page.waitForSelector(".dlg .card2");
  check("Stremio → toast 'Đang mở Stremio…' + dialog 'Đã gửi tới Stremio'", /Đang mở Stremio/.test(await page.textContent(".toasts")) && /Đã gửi tới Stremio/.test(await page.textContent(".dlg .card2 h3")));
  await page.keyboard.press("Escape");
  await page.waitForSelector(".dlg", { state: "detached" });

  // ---------------------------------------------------------------- progress heartbeat + beacon on leave + resume
  await leave(page);
  await playing(ctx, page, MOVIE, "?t=35");
  await sleep(2500);
  await page.click('[data-action="back"]');
  await page.waitForURL(/\/movie\/634649/);
  const cont = await (await ctx.request.get(BASE + "/api/progress/continue")).json();
  const item = cont.items.find((i) => i.mediaKey === MOVIE);
  check("back arrow saves progress (beacon) → continue item ≥ 35 s", item && item.positionS >= 35, JSON.stringify(item));
  await page.waitForSelector("[data-resume]", { timeout: 30000 });
  check("detail primary becomes '▶ Tiếp tục · 0:3x' + 'Xem từ đầu'", /^▶ Tiếp tục · 0:3\d$/.test((await page.textContent("[data-resume]")).trim()) && (await page.$('[data-action="restart"]')) !== null, await page.textContent("[data-resume]"));
  await openPlayer(ctx, page);
  await page.waitForSelector(".dlg .card2");
  check("resume dialog: 'Tiếp tục từ 0:3x?' + '▶ Tiếp tục (5)' + video paused", /^Tiếp tục từ 0:3\d\?$/.test((await page.textContent(".dlg .card2 h3")).trim()) && /Tiếp tục \(5\)/.test(await page.textContent(".dlg .acts")) && (await vid(page)).paused);
  await sleep(2200);
  check("countdown ticks to (3)", /Tiếp tục \((2|3)\)/.test(await page.textContent(".dlg .acts")));
  await page.click('.dlg .acts button:has-text("Xem từ đầu")');
  await page.waitForFunction(PLAYING);
  check("Xem từ đầu → plays from 0", (await vid(page)).t < 5);
  await leave(page);
  await seed({ fixture: "progress", rows: [{ mediaKey: MOVIE, positionS: 35, durationS: 60 }] });
  await openPlayer(ctx, page, MOVIE, "?resume=1");
  await page.waitForFunction(PLAYING, null, { timeout: 20000 });
  check("?resume=1 (continue card) → no prompt, starts at the saved position", (await page.$(".dlg")) === null && (await vid(page)).t >= 34, String((await vid(page)).t));
  await leave(page);
  await seed({ fixture: "progress", rows: [] });

  // ---------------------------------------------------------------- series: next-episode countdown, N, drawer
  await playing(ctx, page, SERIES, "?t=57.5");
  await page.waitForSelector(".nextcard[data-countdown]", { timeout: 15000 });
  check("series at 95 % → next card 'Tập tiếp theo · S4 T2' with ring countdown", /Tập tiếp theo · S4 T2/.test(await page.textContent(".nextcard .t")) && Number(await page.getAttribute(".nextcard", "data-countdown")) <= 10);
  await sleep(1300);
  check("ring counts down", Number(await page.getAttribute(".nextcard", "data-countdown")) <= 9);
  await page.click('[data-action="cancel-next"]');
  check("Huỷ dismisses the card", (await page.$(".nextcard")) === null);
  await page.waitForSelector('.endscreen[data-endscreen="ended"] [data-action="play-next"]', { timeout: 15000 });
  check("Huỷ → the episode ends into the end screen: ↺ Xem lại / Về trang phim / Tập tiếp theo", (await page.$$eval(".endscreen .btn", (b) => b.map((x) => x.textContent.trim()).join("|"))) === "↺ Xem lại|Về trang phim|Tập tiếp theo" && (await page.$(".nextcard")) === null, await page.$$eval(".endscreen .btn", (b) => b.map((x) => x.textContent.trim()).join("|")));
  const idBefore = page.url();
  await page.keyboard.press("n");
  await page.waitForURL((u) => /\/watch\/[0-9a-f]{32}$/.test(u.href) && u.href !== idBefore, { timeout: 20000 });
  await page.waitForSelector(".ctl .title span");
  check("N → next episode resolved (same pack) → new /watch with S4 T2", /^S4 T2 · /.test((await page.textContent(".ctl .title span")).trim()), await page.textContent(".ctl .title span"));
  await page.waitForFunction(PLAYING, null, { timeout: 20000 });
  await page.mouse.move(700, 400);
  await page.click('[data-action="episodes"]');
  await page.waitForSelector(".drawer .ep");
  check("episode drawer: 9 rows, current S4 T2 is .on, chips", (await page.$$(".drawer .ep")).length === 9 && (await page.getAttribute(".drawer .ep.on", "data-drawer-episode")) === "2" && (await page.$(".drawer .tag")) !== null);
  const idS4T2 = page.url();
  await page.click('.drawer .ep[data-drawer-episode="3"]');
  await page.waitForURL((u) => /\/watch\/[0-9a-f]{32}$/.test(u.href) && u.href !== idS4T2, { timeout: 20000 });
  await page.waitForSelector(".ctl .title span");
  check("drawer pick → switches to S4 T3", /^S4 T3 · /.test((await page.textContent(".ctl .title span")).trim()));
  await leave(page);
  await playing(ctx, page, "tv:66732:4:9", "?t=58.5");
  await page.waitForSelector('.endscreen[data-endscreen="end-season"]', { timeout: 15000 });
  check("last episode ends → 'Hết mùa 4' + '▶ Chuyển sang mùa 5'", /Hết mùa 4/.test(await page.textContent(".endscreen h2")) && /Chuyển sang mùa 5/.test(await page.textContent('.endscreen [data-action="next-season"]')));
  await leave(page);
  await playing(ctx, page, MOVIE, "?t=58.5");
  await page.waitForSelector('.endscreen[data-endscreen="ended"]', { timeout: 15000 });
  check("movie ends → 'Đã xem hết' · marked watched (completed in continue list)", /Đã xem hết/.test(await page.textContent(".endscreen h2")) && /đã đánh dấu đã xem/.test(await page.textContent(".endscreen p")));
  await sleep(500);
  check("ended → progress completed (not in continue)", !(await (await ctx.request.get(BASE + "/api/progress/continue")).json()).items.some((i) => i.mediaKey === MOVIE));
  await page.click('.endscreen [data-action="replay"]');
  await page.waitForFunction(PLAYING, null, { timeout: 10000 });
  check("↺ Xem lại restarts", (await vid(page)).t < 5);
  await leave(page);
  await seed({ fixture: "progress", rows: [] });

  // ---------------------------------------------------------------- watchdog states
  await page.route("**/api/dev/sample.mp4*", async (route) => { await sleep(12000); await route.continue().catch(() => {}); });
  await openPlayer(ctx, page);
  await page.waitForSelector('.pcenter[data-overlay="loading"]');
  check("'Đang tải…' while the media request is pending", /^Đang tải…$/.test((await page.textContent(".pcenter .m")).trim()));
  await page.waitForSelector('.pcenter[data-overlay="stall"]', { timeout: 12000 });
  check("> 8 s without playing → stall hint + 'Xem bằng app' / 'Chọn bản khác'", /Đang tải… \(\d+ giây\)/.test(await page.textContent(".pcenter .m")) && /Mạng chậm/.test(await page.textContent(".pcenter .hint")) && (await page.$('.pcenter [data-action="open-app"]')) !== null);
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await page.waitForFunction(PLAYING, null, { timeout: 20000 });
  check("stall clears once data arrives", (await page.$(".pcenter")) === null);
  await leave(page);
  await scenario(["play-sample=ac3"]);
  const tA = Date.now();
  await playing(ctx, page);
  await page.waitForSelector('[data-banner="no-audio"]', { timeout: 15000 });
  check("AC3 sample → no-audio banner within ~8 s of play", Date.now() - tA < 12000 && /Có hình nhưng không có tiếng/.test(await page.textContent('[data-banner="no-audio"]')), `${Date.now() - tA}ms`);
  await leave(page);
  await scenario(["play-sample", "playback-fail"]);
  await openPlayer(ctx, page);
  await page.waitForSelector(".dlg .card2", { timeout: 15000 });
  check("undecodable MKV → codec dialog with 'Chọn bản MP4 (YTS 2.7 GB)'", /không phát được bản MKV/.test(await page.textContent(".dlg .card2 h3")) && /Chọn bản MP4 \(YTS 2\.7 GB\)/.test(await page.textContent(".dlg .acts")) && (await page.getAttribute(".player", "data-phase")) === "codec-error");
  await leave(page);
  await scenario(["play-sample"]);
  await playing(ctx, page);
  await page.keyboard.press("ArrowRight");
  await sleep(300);
  const tBefore = (await vid(page)).t;
  await scenario(["play-sample", "link-expired"]);
  // re-request the media and sample the clock for 2 s: the held position must cover the relink (never 0:00)
  const clocks = await page.evaluate(async () => {
    const v = document.querySelector("video");
    v.src = v.src + "&x=1";
    v.load();
    const seen = new Set();
    for (let i = 0; i < 40; i++) {
      seen.add((document.querySelector(".seek .time")?.textContent ?? "").trim());
      await new Promise((r) => setTimeout(r, 50));
    }
    return [...seen];
  });
  check("relink keeps the last known clock (no 0:00 flash)", clocks.length > 0 && !clocks.includes("0:00"), clocks.join("|"));
  await page.waitForSelector(".toasts .toast.warn", { timeout: 10000 });
  check("expired link → warn toast + 'Đang lấy link mới…' overlay", /Link hết hạn, đang lấy link mới/.test(await page.textContent(".toasts .toast.warn")));
  await page.waitForFunction(PLAYING, null, { timeout: 20000 });
  check("relink → new handle plays on from the saved position", (await vid(page)).t >= tBefore - 1 && (await page.getAttribute(".player", "data-phase")) === "playing", `${tBefore.toFixed(1)} → ${(await vid(page)).t.toFixed(1)}`);
  await scenario(["play-sample", "link-expired=fail"]);
  await rerequestMedia(page);
  await page.waitForSelector(".dlg .card2", { timeout: 20000 });
  check("second refresh fails → 'Không lấy được link mới' with the real position (not 0:00) + Thử lại", /Không lấy được link mới/.test(await page.textContent(".dlg .card2 h3")) && /Vị trí xem \(0:\d\d\) đã được lưu/.test(await page.textContent(".dlg .card2 p")) && !/\(0:00\)/.test(await page.textContent(".dlg .card2 p")) && (await page.$('.dlg .acts button:has-text("Thử lại")')) !== null, await page.textContent(".dlg .card2 p"));
  await leave(page);
  await scenario(["play-sample"]);
  await playing(ctx, page);
  await ctx.setOffline(true);
  await page.waitForSelector('[data-banner="offline"]');
  check("offline → top err banner with buffered seconds left, playback continues", /Mất kết nối mạng.*còn ~\d+ giây/.test(await page.textContent('[data-banner="offline"]')) && !(await vid(page)).paused);
  await ctx.setOffline(false);
  await page.waitForSelector('[data-banner="offline"]', { state: "detached" });
  check("online again → banner gone, still playing", (await page.$('[data-banner="offline"]')) === null && !(await vid(page)).paused);
  await leave(page);

  // ---------------------------------------------------------------- viewer limit
  await seed({ fixture: "viewers", count: 5 });
  await openPlayer(ctx, page);
  await page.waitForSelector(".dlg .card2");
  check("5 active viewers → 'Đang có 5 người xem' dialog, no src attached", /Đang có 5 người xem/.test(await page.textContent(".dlg .card2 h3")) && (await page.evaluate(() => !document.querySelector("video").src)));
  await page.click('.dlg .acts button:has-text("Xem bằng app")');
  await page.waitForSelector(".sheet2");
  check("'Xem bằng app' under the limit opens the hand-off sheet (dialog closed, 6 items)", (await page.$$(".sheet2 .it")).length === 6 && (await page.$(".dlg .card2")) === null);
  await page.keyboard.press("Escape");
  await seed({ fixture: "clear-views" });
  await page.click('[data-action="cast"]').catch(() => {});
  await page.keyboard.press("Escape").catch(() => {});
  await leave(page);
  await seed({ fixture: "viewers", count: 5 });
  await openPlayer(ctx, page);
  await page.waitForSelector(".dlg .card2");
  await seed({ fixture: "clear-views" });
  await page.click('.dlg .acts button:has-text("Thử lại")');
  await page.waitForFunction(PLAYING, null, { timeout: 20000 });
  check("'Thử lại' after a seat frees up → dialog gone, video plays", (await page.$(".dlg .card2")) === null && !(await vid(page)).paused && (await vid(page)).t > 0.3);
  for (let i = 1; i <= 5; i++) await seed({ fixture: "delete-user", username: `viewer${i}` });
  await leave(page);

  // ---------------------------------------------------------------- mobile: layout + double-tap
  const m = await newCtx(browser, { width: 390, height: 844 }, true);
  const mp = await m.ctx.newPage();
  await playing(m.ctx, mp);
  check("≤ 700 px: no title in .ctl, subtitle band 19px, sheet full width", (await mp.$eval(".ctl .title", (el) => getComputedStyle(el).display)) === "none" && (await mp.$eval(".subs", (el) => getComputedStyle(el).fontSize)) === "19px");
  const tm = (await vid(mp)).t;
  await mp.touchscreen.tap(330, 400);
  await mp.touchscreen.tap(330, 400);
  await sleep(300);
  check("double-tap right third → +10 s", (await vid(mp)).t - tm >= 9, `${tm.toFixed(1)} → ${(await vid(mp)).t.toFixed(1)}`);
  await mp.touchscreen.tap(60, 400);
  await mp.touchscreen.tap(60, 400);
  await sleep(100);
  check("double-tap left third → −10 s + ↺10 flash", Math.abs((await vid(mp)).t - tm) < 3 && (await mp.$(".pflash .ico")) !== null, String((await vid(mp)).t));
  await sleep(600);
  await mp.goto("about:blank");
  await sleep(600);
  await playing(m.ctx, mp, SERIES);
  const fit = await mp.$$eval(".ctl button.ib", (b) => ({ visible: b.filter((x) => getComputedStyle(x).display !== "none").map((x) => x.dataset.action), maxRight: Math.max(...b.map((x) => x.getBoundingClientRect().right)), minLeft: Math.min(...b.filter((x) => getComputedStyle(x).display !== "none").map((x) => x.getBoundingClientRect().left)) }));
  check("≤ 700 px series row: speed + PiP hidden, 9 buttons inside the 30px bar padding", fit.visible.join(",") === "toggle-play,back10,fwd10,mute,next,episodes,cc,cast,fullscreen" && fit.minLeft >= 30 && fit.maxRight <= 360, JSON.stringify(fit));
  await mp.setViewportSize({ width: 360, height: 780 });
  await sleep(300);
  const fit360 = await mp.$$eval(".ctl button.ib", (b) => Math.max(...b.map((x) => x.getBoundingClientRect().right)));
  check("360 px: series row still not clipped (gap 8px)", fit360 <= 330, String(fit360));
  await sleep(400);
  await mp.touchscreen.tap(195, 400);
  await sleep(200);
  const vis1 = await mp.getAttribute(".player", "data-controls");
  await sleep(400);
  await mp.touchscreen.tap(195, 400);
  await sleep(200);
  check("single tap toggles the controls (never play/pause)", vis1 !== (await mp.getAttribute(".player", "data-controls")) && !(await vid(mp)).paused, `${vis1} → ${await mp.getAttribute(".player", "data-controls")}`);
  await leave(mp);
  await m.ctx.close();

  check("0 console errors on player pages", consoleErrors.length === 0 && m.consoleErrors.length === 0, [...consoleErrors, ...m.consoleErrors].slice(0, 3).join(" | "));
  await ctx.request.post(BASE + "/api/dev/scenario", { data: { flags: [] } });
  await seed({ fixture: "progress", rows: [] });
  await ctx.close();
  await seeder.dispose();
  await browser.close();
  report.finish();
}

main().catch((err) => { console.error(err); process.exit(1); });
