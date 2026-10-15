// Phase 5 extra Playwright checks (from the tester's p5-ux-extra, made durable) — RUNNING dev server (LUMEN_SCENARIOS=1),
// local sample + subtitle sim, zero provider / TorBox traffic. Crafted cues (via the `subs-row` fixture) prove the band
// renders <i>/<b> as elements, keeps nested / identical-timing cues and matches Chromium's native <track> timing;
// hotkeys inside the popover (incl. `?`), outside click without a play toggle, control pass-through, C cycling under
// quota, the done toast with the popover closed, reload while translating, merged prefs patches, 0 console errors.
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
const PLAYING = () => { const v = document.querySelector("video"); return Boolean(v && !v.paused && v.currentTime > 0.3); };

let seeder;
const seed = (fixture) => seeder.post(BASE + "/api/dev/seed", { data: fixture });
const bandText = (page) => page.$eval(".subs", (el) => el.textContent ?? "");
const vstate = (page) => page.evaluate(() => { const v = document.querySelector("video"); return { t: v.currentTime, paused: v.paused, vol: v.volume, muted: v.muted, fs: Boolean(document.fullscreenElement) }; });
const seekTo = async (page, t) => { await page.evaluate((t) => { document.querySelector("video").currentTime = t; }, t); await sleep(350); };

/** cue k = [1+2k, 2+2k) s "C<k>" (k < 18, cue 3 italic, cue 4 bold) + a 40–50 s sign over two identical-timing dialogue cues at 42–44 s (sample is 60 s) */
const CRAFTED = [
  ...Array.from({ length: 18 }, (_, k) => ({ start: (1 + 2 * k) * 1000, end: (2 + 2 * k) * 1000, text: k === 3 ? "<i>C3 italic</i> plain" : k === 4 ? "<b>C4 bold</b>" : `C${k}` })),
  { start: 40_000, end: 50_000, text: "SIGN ON TOP" },
  { start: 42_000, end: 44_000, text: "under the sign" },
  { start: 42_000, end: 44_000, text: "second speaker" },
];

async function newCtx(browser, viewport = { width: 1440, height: 900 }, mobile = false) {
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, locale: "vi-VN" });
  const consoleErrors = [];
  ctx.on("page", (p) => {
    p.on("console", (m) => { if (m.type() === "error" && !IGNORED_CONSOLE.test(m.text())) consoleErrors.push(`${p.url().replace(BASE, "")} :: ${m.text().slice(0, 160)}`); });
    p.on("pageerror", (e) => consoleErrors.push(`${p.url()} :: pageerror ${String(e).slice(0, 160)}`));
  });
  const r = await ctx.request.post(BASE + "/api/auth/login", { data: { username: ADMIN.u, password: ADMIN.p, remember: true } });
  if (!r.ok()) { console.error(`admin login failed: ${r.status()}`); process.exit(2); }
  const scenario = (flags) => ctx.request.post(BASE + "/api/dev/scenario", { data: { flags } });
  const api = async (p) => (await ctx.request.get(BASE + p)).json();
  return { ctx, consoleErrors, scenario, api };
}
async function playing(ctx, page) {
  await seed({ fixture: "progress", rows: [] }); // every section starts at 0:00 (the leave beacon of the previous one stored a position)
  const r = await (await ctx.request.post(BASE + "/api/play/resolve", { data: { mediaKey: MOVIE, auto: true } })).json();
  await page.goto(`${BASE}/watch/${r.streamId}`);
  await page.waitForFunction(PLAYING, null, { timeout: 20000 });
  await page.mouse.move(700, 400);
}
const openPop = async (page) => { await page.mouse.move(700, 400); await page.waitForSelector('.player[data-controls="visible"]'); await page.click('[data-action="cc"]'); await page.waitForSelector('.pop [data-col="subs"] .it'); };
const closePop = async (page) => { await page.keyboard.press("Escape"); await page.waitForSelector(".pop", { state: "detached" }); };
const leave = async (page) => { await page.goto("about:blank"); await sleep(300); };

async function main() {
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  seeder = await request.newContext();
  await seeder.post(BASE + "/api/auth/login", { data: { username: ADMIN.u, password: ADMIN.p, remember: false } });
  await seed({ fixture: "clear-views" });
  await seed({ fixture: "progress", rows: [] });
  await seed({ fixture: "subs", mediaKey: MOVIE });
  await seeder.patch(BASE + "/api/me/settings", { data: { sub_lang: "vi", sub_size: "M" } });
  const crafted = (await (await seed({ fixture: "subs-row", mediaKey: MOVIE, lang: "vi", source: "subdl", label: "qa.crafted.vi", cues: CRAFTED })).json()).id;
  const { ctx, consoleErrors, scenario, api } = await newCtx(browser);
  await scenario(["play-sample", "subs-sim=popover"]);
  const page = await ctx.newPage();

  // ---------------------------------------------------------------- crafted cues: markup, overlaps, native <track> cross-check
  await playing(ctx, page);
  await openPop(page);
  await page.click(`.pop [data-track="${crafted}"]`);
  await page.waitForSelector(`.pop [data-track="${crafted}"].on`);
  await closePop(page);
  await page.evaluate(() => document.querySelector("video").pause());
  await seekTo(page, 7.2);
  check("<i> cue renders as an <i> element (no literal tag), bold cue as <b>", (await bandText(page)) === "C3 italic plain" && (await page.$(".subs i")) !== null && !(await bandText(page)).includes("<"), await bandText(page));
  await seekTo(page, 9.2);
  check("<b> cue", (await page.$eval(".subs", (el) => el.querySelector("b")?.textContent ?? "")) === "C4 bold");
  await seekTo(page, 43);
  const stacked = await bandText(page);
  check("nested sign + two identical-timing dialogue cues all render (3 lines, start order)", stacked === "SIGN ON TOPunder the signsecond speaker" && (await page.$$eval(".subs br", (b) => b.length)) === 2, stacked);
  await seekTo(page, 46);
  check("only the sign remains once the dialogue ends", (await bandText(page)) === "SIGN ON TOP");
  const vttUrl = (await api(`/api/subs/search?mediaKey=${MOVIE}`)).tracks.find((t) => t.id === crafted).vttUrl;
  await page.evaluate((url) => { const v = document.querySelector("video"); const tr = document.createElement("track"); tr.kind = "subtitles"; tr.src = url; tr.id = "qa-native"; v.appendChild(tr); tr.track.mode = "hidden"; }, vttUrl);
  await page.waitForFunction(() => (document.getElementById("qa-native")?.track?.cues?.length ?? 0) > 0, null, { timeout: 8000 });
  check("Chromium's native VTT parser accepts the file with all 21 cues (overlaps included)", (await page.evaluate(() => document.getElementById("qa-native").track.cues.length)) === 21);
  const strip = (s) => s.replace(/<[^>]+>/g, "");
  const samples = [];
  for (const t of [1.5, 3.9, 4.05, 7.2, 20.5, 35.95, 43, 49.5]) { // no exact cue boundary: Chromium snaps currentTime to a frame, the band is end-exclusive
    await seekTo(page, t);
    samples.push({ t, ...(await page.evaluate(() => ({ band: document.querySelector(".subs")?.textContent ?? "", nat: [...document.getElementById("qa-native").track.activeCues].map((c) => c.text).join("") }))) });
  }
  check("band text == native activeCues at 8 seek points (boundaries + overlaps)", samples.every((s) => s.band === strip(s.nat)), samples.map((s) => `${s.t}: "${s.band}" vs "${strip(s.nat)}"`).join(" ; "));
  await openPop(page);
  for (let i = 0; i < 5; i++) await page.click('[data-action="offset-plus"]');
  await page.waitForFunction(() => document.querySelector("[data-offset-value]")?.textContent === "+0.5s");
  await closePop(page);
  const shifted = [];
  for (const t of [1.3, 1.6, 7.7, 43.2]) {
    await seekTo(page, t);
    const band = await bandText(page);
    await seekTo(page, t - 0.5);
    shifted.push({ t, band, expect: strip(await page.evaluate(() => [...document.getElementById("qa-native").track.activeCues].map((c) => c.text).join(""))) });
  }
  check("offset +0.5 s: band at t == native cues at t−0.5", shifted.every((s) => s.band === s.expect), shifted.map((s) => `${s.t}: "${s.band}" vs "${s.expect}"`).join(" ; "));
  await openPop(page);
  for (let i = 0; i < 5; i++) await page.click('[data-action="offset-minus"]');
  await page.waitForFunction(() => document.querySelector("[data-offset-value]")?.textContent === "0.0s");

  // ---------------------------------------------------------------- hotkeys inside the popover (incl. `?`), outside click, control pass-through
  await page.focus('.pop [data-col="subs"] .it.on');
  const before = await vstate(page);
  const selBefore = await page.$eval('.pop [data-col="subs"] .it.on', (el) => el.textContent);
  for (const k of ["k", "m", "f", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "j", "l", "c", "n", "?", "/"]) await page.keyboard.press(k);
  await sleep(200);
  const after = await vstate(page);
  const dialogs = await page.$$eval('[role="dialog"]', (els) => els.filter((e) => !e.classList.contains("pop")).length);
  check("inside the popover: k/m/f/j/l/c/n/arrows/`?`/`/` → video untouched, selection unchanged, popover open, NO shell help dialog", after.paused === before.paused && Math.abs(after.t - before.t) < 0.05 && after.vol === before.vol && after.muted === before.muted && !after.fs && (await page.$eval('.pop [data-col="subs"] .it.on', (el) => el.textContent)) === selBefore && (await page.$(".pop")) !== null && dialogs === 0, JSON.stringify({ before, after, dialogs }));
  const pausedBefore = (await vstate(page)).paused;
  await page.mouse.click(400, 300);
  await sleep(400);
  check("click on the video outside the popover closes it WITHOUT toggling play/pause", (await page.$(".pop")) === null && (await vstate(page)).paused === pausedBefore, `paused ${pausedBefore} → ${(await vstate(page)).paused}`);
  await openPop(page);
  const pausedBefore2 = (await vstate(page)).paused;
  await page.click('[data-action="toggle-play"]');
  await sleep(400);
  check("a control clicked while the popover is open still works (play toggled) and the popover closes", (await page.$(".pop")) === null && (await vstate(page)).paused !== pausedBefore2);
  await page.evaluate(() => document.querySelector("video").pause());
  await page.mouse.move(700, 400);
  await page.click('[data-action="cc"]');
  await page.waitForSelector(".pop");
  await page.click('[data-action="cc"]');
  await sleep(200);
  check("second click on the cc button closes the popover", (await page.$(".pop")) === null);

  // ---------------------------------------------------------------- merged prefs patch: offset then size within the debounce → both persisted
  await openPop(page);
  await page.click('[data-action="offset-plus"]');
  await page.click('[data-size="L"]');
  await sleep(700);
  await page.reload();
  await page.waitForFunction(PLAYING, null, { timeout: 20000 });
  await openPop(page);
  check("offset click + size click < 400 ms apart → one merged PATCH, both survive a reload (+0.1s, L)", (await page.textContent("[data-offset-value]")) === "+0.1s" && (await page.$eval('[data-ctrl="size"] u', (u) => u.textContent)) === "L", `${await page.textContent("[data-offset-value]")} ${await page.$eval('[data-ctrl="size"] u', (u) => u.textContent)}`);
  await page.click('[data-size="M"]');
  await page.click('[data-action="offset-minus"]');
  await closePop(page);
  await leave(page);

  // ---------------------------------------------------------------- C cycling under quota; done toast with the popover closed
  await seed({ fixture: "subs", mediaKey: MOVIE });
  await scenario(["play-sample", "subs-sim=popover-quota", "os-quota-zero"]);
  await playing(ctx, page);
  await page.waitForSelector(".subs span", { timeout: 10000 }).catch(() => {});
  const cyc = [];
  for (let i = 0; i < 4; i++) { await page.keyboard.press("c"); await sleep(250); cyc.push(await page.evaluate(() => document.querySelector(".subs")?.dataset.track ?? "")); }
  const qTracks = (await api(`/api/subs/search?mediaKey=${MOVIE}`)).tracks;
  const subdlVi = String(qTracks.find((t) => t.lang === "vi" && t.source === "subdl").id), subdlEn = String(qTracks.find((t) => t.lang === "en").id);
  check("quota: SubDL vi auto-selected; C → en → Tắt → vi → en, locked OS never visited", cyc.join(">") === [subdlEn, "", subdlVi, subdlEn].join(">"), cyc.join(">"));
  await leave(page);
  await seed({ fixture: "subs", mediaKey: MOVIE });
  await scenario(["play-sample", "subs-sim=popover-none"]);
  await playing(ctx, page);
  await openPop(page);
  await page.click('[data-action="translate"]');
  await page.waitForSelector('[data-translate="running"]');
  await closePop(page);
  await page.waitForSelector(".toasts .toast", { timeout: 30000 });
  await page.waitForSelector(".subs.ai", { timeout: 10000 });
  check("translation finishing while the popover is CLOSED → toast + AI track selected + 'Phụ đề: Dịch AI (DeepSeek)'", (await page.textContent(".toasts .toast")).includes("Phụ đề AI đã sẵn sàng") && (await page.textContent(".sub-src")) === "Phụ đề: Dịch AI (DeepSeek)");

  // ---------------------------------------------------------------- reload while translating (frozen 42 %) → job adopted, interim English ✓
  await leave(page);
  await seed({ fixture: "subs", mediaKey: MOVIE });
  await scenario(["play-sample", "subs-sim=popover-translating"]);
  await playing(ctx, page);
  await openPop(page);
  await page.click('[data-action="translate"]');
  await page.waitForSelector('[data-translate="running"]');
  await page.reload();
  await page.waitForFunction(PLAYING, null, { timeout: 20000 });
  await openPop(page);
  check("after reload: '⟳ … 42%' adopted, English ✓ shown locally, .mini at 42 %", /42%/.test(await page.textContent('[data-translate="running"]')) && (await page.$('.pop [data-lang="en"].on')) !== null && (await page.$eval('[data-translate="running"] .mini i', (el) => el.style.width)) === "42%");
  check("the interim English was never persisted (search still answers Tắt for this title)", (await api(`/api/subs/search?mediaKey=${MOVIE}`)).selectedId === null);
  await closePop(page);
  await leave(page);

  check("0 console errors across the run", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" || "));
  await scenario([]);
  await seed({ fixture: "subs", mediaKey: MOVIE });
  await ctx.close();
  await browser.close();
  report.finish();
}

main().catch((err) => { console.error(err); process.exit(1); });
