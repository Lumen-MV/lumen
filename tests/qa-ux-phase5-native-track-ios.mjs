// Native <track> for the iPhone system full screen (Playwright, RUNNING dev server with LUMEN_SCENARIOS=1, local sample +
// subtitle sim — zero provider traffic). WebKit with an iPhone user agent when the WebKit build launches (`npx playwright
// install webkit`), else Chromium with the same UA: the selected subtitle is a real <track kind=subtitles> on the <video>
// whose mode is `hidden` while the DOM band renders, `showing` after `webkitbeginfullscreen`, `hidden` again after
// `webkitendfullscreen`; a track switch while "full screen" keeps `showing`; "Tắt" removes the track; the offset shifts the
// native cues; our container full screen (standard API) never shows the native cues. Then Chromium: band renders + hidden.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, request, webkit } from "@playwright/test";
import { adminCreds, makeReporter, readEnv, sleep } from "./qa-shared-helpers.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const BASE = args.includes("--base") ? args[args.indexOf("--base") + 1] : "http://localhost:3000";
const ADMIN = adminCreds(readEnv(ROOT));
const report = makeReporter();
const { check, note } = report;
const MOVIE = "movie:634649";
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const IGNORED_CONSOLE = /status of (403|404|410|429|503)|scheme does not have a registered handler|Failed to load resource/;

const trackState = (page) => page.evaluate(() => {
  const t = document.querySelector("video track");
  return t ? { present: true, mode: t.track.mode, kind: t.kind, srclang: t.srclang, label: t.label, src: t.getAttribute("src"), id: t.dataset.nativeSub, cues: t.track.cues ? t.track.cues.length : -1, first: t.track.cues?.[0] ? [t.track.cues[0].startTime, t.track.cues[0].endTime] : null } : { present: false };
});
const fire = (page, type) => page.evaluate((e) => document.querySelector("video").dispatchEvent(new Event(e)), type);
const openPop = async (page) => { await page.mouse.move(700, 400); await page.click('[data-action="cc"]'); await page.waitForSelector('.pop [data-col="subs"] .it'); };
const closePop = async (page) => { await page.keyboard.press("Escape"); await page.waitForSelector(".pop", { state: "detached" }); };

async function session(browser, opts) {
  const ctx = await browser.newContext({ locale: "vi-VN", ...opts });
  const consoleErrors = [];
  ctx.on("page", (p) => {
    p.on("console", (m) => { if (m.type() === "error" && !IGNORED_CONSOLE.test(m.text())) consoleErrors.push(m.text().slice(0, 200)); });
    p.on("pageerror", (e) => consoleErrors.push(`pageerror ${String(e).slice(0, 200)}`));
  });
  const r = await ctx.request.post(BASE + "/api/auth/login", { data: { username: ADMIN.u, password: ADMIN.p, remember: true } });
  if (!r.ok()) { console.error(`admin login failed: ${r.status()}`); process.exit(2); }
  await ctx.request.post(BASE + "/api/dev/scenario", { data: { flags: ["play-sample", "subs-sim=popover"] } });
  const { streamId } = await (await ctx.request.post(BASE + "/api/play/resolve", { data: { mediaKey: MOVIE, auto: true } })).json();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/watch/${streamId}`);
  // the track mounts with the selected subtitle as soon as the manifest + search answered — playback itself is not needed
  await page.waitForSelector("video track", { state: "attached", timeout: 20000 });
  return { ctx, page, consoleErrors };
}

async function iphoneChecks(browser, engine) {
  const { ctx, page, consoleErrors } = await session(browser, { userAgent: IPHONE_UA, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const tracks = (await (await ctx.request.get(`${BASE}/api/subs/search?mediaKey=${MOVIE}`)).json()).tracks;
  const vi = tracks[0], en = tracks.find((t) => t.lang === "en");
  await page.waitForFunction(() => document.querySelector("video track")?.track.mode === "hidden", null, { timeout: 10000 }).catch(() => {});
  const t0 = await trackState(page);
  check(`[${engine}] <track kind=subtitles srclang=vi label src=/api/subs/<vi>.vtt> on the <video>, mode hidden outside full screen`, t0.present && t0.kind === "subtitles" && t0.srclang === "vi" && t0.label === vi.label && t0.src === vi.vttUrl && t0.mode === "hidden" && t0.id === String(vi.id), JSON.stringify(t0));
  await page.waitForFunction(() => (document.querySelector("video track")?.track.cues?.length ?? 0) > 0, null, { timeout: 10000 }).catch(() => {});
  const loaded = await trackState(page);
  check(`[${engine}] hidden mode loads the cues (not disabled)`, loaded.cues > 0, JSON.stringify(loaded));
  await fire(page, "webkitbeginfullscreen");
  await sleep(150);
  check(`[${engine}] webkitbeginfullscreen → mode showing`, (await trackState(page)).mode === "showing");
  // switching the subtitle while in the system full screen: the new <track> element must come up `showing`
  await page.evaluate(() => { const v = document.querySelector("video"); v.pause(); });
  await openPop(page);
  await page.click(`.pop [data-track="${en.id}"]`);
  await page.waitForSelector(`.pop [data-track="${en.id}"].on`);
  await closePop(page);
  await page.waitForFunction((id) => document.querySelector("video track")?.dataset.nativeSub === String(id), en.id, { timeout: 10000 });
  await sleep(150);
  const sw = await trackState(page);
  check(`[${engine}] track switch while full screen → new <track> (en) is showing`, sw.srclang === "en" && sw.src === en.vttUrl && sw.mode === "showing", JSON.stringify(sw));
  await fire(page, "webkitendfullscreen");
  await sleep(150);
  check(`[${engine}] webkitendfullscreen → mode hidden`, (await trackState(page)).mode === "hidden");
  // offset: +0.5 s shifts the native cues like the band (first cue 0 → 0.5 s)
  await page.waitForFunction(() => (document.querySelector("video track")?.track.cues?.length ?? 0) > 0, null, { timeout: 10000 }).catch(() => {});
  const before = await trackState(page);
  await openPop(page);
  for (let i = 0; i < 5; i++) await page.click('.pop [data-action="offset-plus"]');
  await sleep(900);
  const after = await trackState(page);
  check(`[${engine}] offset +0.5 s shifts the native cues by +0.5 s`, before.first && after.first && Math.abs(after.first[0] - before.first[0] - 0.5) < 0.01 && Math.abs(after.first[1] - before.first[1] - 0.5) < 0.01, `${JSON.stringify(before.first)} → ${JSON.stringify(after.first)}`);
  await page.click('.pop [data-track="off"]');
  await page.waitForSelector('.pop [data-track="off"].on');
  await closePop(page);
  await page.waitForSelector("video track", { state: "detached", timeout: 10000 }).catch(() => {});
  check(`[${engine}] Tắt → no <track> at all`, !(await trackState(page)).present);
  // a fullscreenchange where the container (not the element) is full screen must keep the track hidden
  await openPop(page);
  await page.click(`.pop [data-track="${vi.id}"]`);
  await page.waitForSelector(`.pop [data-track="${vi.id}"].on`);
  await closePop(page);
  await page.waitForSelector("video track", { state: "attached", timeout: 10000 });
  await fire(page, "webkitbeginfullscreen");
  await sleep(100);
  await page.evaluate(() => document.dispatchEvent(new Event("fullscreenchange")));
  await sleep(150);
  check(`[${engine}] standard fullscreenchange without the element being full screen → hidden (container full screen = band)`, (await trackState(page)).mode === "hidden");
  check(`[${engine}] 0 console errors`, consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" || "));
  await ctx.request.post(BASE + "/api/dev/scenario", { data: { flags: [] } });
  await ctx.close();
}

async function main() {
  const seeder = await request.newContext();
  await seeder.post(BASE + "/api/auth/login", { data: { username: ADMIN.u, password: ADMIN.p, remember: false } });
  await seeder.post(BASE + "/api/dev/seed", { data: { fixture: "subs", mediaKey: MOVIE } });
  await seeder.post(BASE + "/api/dev/seed", { data: { fixture: "reset-rate-limit" } });

  let wk = null;
  try { wk = await webkit.launch(); } catch (err) { note(`WebKit not launchable (${String(err).split("\n")[0].slice(0, 80)}) → iPhone checks run on Chromium only`); }
  if (wk) { await iphoneChecks(wk, "webkit"); await wk.close(); }

  const cr = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  await iphoneChecks(cr, "chromium+iphone-ua");
  // desktop Chromium: band renders the cue (DOM) while the native track stays hidden → never two subtitle layers
  await seeder.post(BASE + "/api/dev/seed", { data: { fixture: "subs", mediaKey: MOVIE } });
  const { ctx, page, consoleErrors } = await session(cr, { viewport: { width: 1440, height: 900 } });
  await page.waitForFunction(() => { const v = document.querySelector("video"); return Boolean(v && !v.paused && v.currentTime > 0.3); }, null, { timeout: 20000 });
  await page.waitForSelector(".subs span", { timeout: 10000 });
  const ts = await trackState(page);
  check("[chromium desktop] band renders the vi cue while <track> mode is hidden (no double subtitles)", /Peter, mình cần nói chuyện/.test(await page.$eval(".subs", (el) => el.textContent ?? "")) && ts.mode === "hidden", JSON.stringify(ts));
  check("[chromium desktop] 0 console errors", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" || "));
  await ctx.request.post(BASE + "/api/dev/scenario", { data: { flags: [] } });
  await ctx.close();
  await cr.close();
  await seeder.dispose();
  report.finish();
}

main().catch((err) => { console.error(err); process.exit(1); });
