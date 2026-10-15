// FINAL real-TorBox smoke (manual, run ONCE, not part of qa:phase4): Chromium plays the cached Spider-Man YTS 1080p MP4 in
// `direct` mode for ≤ 20 s — first frame time, one seek, 206 answers from the CDN — then stops. Prints timings only, never a URL.
//   node tests/qa-smoke-real-torbox-phase4.mjs [--base http://localhost:3000]
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { adminCreds, makeReporter, readEnv, sleep } from "./qa-shared-helpers.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const BASE = args.includes("--base") ? args[args.indexOf("--base") + 1] : "http://localhost:3000";
const ADMIN = adminCreds(readEnv(ROOT));
const report = makeReporter();
const { check, note } = report;
const MOVIE = "movie:634649";
const BUDGET_MS = 20_000;

async function main() {
  // autoplay must not depend on Playwright evaluate timing (its first evaluate carries the user gesture): real viewers arrive by a click + router.push
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "vi-VN" });
  await ctx.request.post(BASE + "/api/auth/login", { data: { username: ADMIN.u, password: ADMIN.p, remember: true } });
  await ctx.request.post(BASE + "/api/dev/scenario", { data: { flags: [] } });
  const tResolve = Date.now();
  const r = await ctx.request.post(BASE + "/api/play/resolve", { data: { mediaKey: MOVIE, auto: true } });
  const resolveMs = Date.now() - tResolve;
  const j = await r.json().catch(() => ({}));
  check("resolve (real TorBox, cached) → direct MP4 streamId", r.ok() && j.playClass === "direct" && /\.(mp4|m4v)$/i.test(j.fileName ?? ""), `${r.status()} ${resolveMs}ms ${j.playClass}`);
  if (!r.ok()) return report.finish();
  const man = await (await ctx.request.get(`${BASE}/api/play/manifest?streamId=${j.streamId}`)).json();
  check("manifest mode direct (CDN URL only in this JSON)", man.mode === "direct" && /^https?:\/\//.test(man.src ?? ""));

  const page = await ctx.newPage();
  const media = []; // {status, ms} of every media response from the CDN host (host never printed)
  const cdnHost = new URL(man.src).host;
  page.on("response", (res) => { try { if (new URL(res.url()).host === cdnHost) media.push({ status: res.status(), at: Date.now() }); } catch { /* ignore */ } });
  const t0 = Date.now();
  await page.goto(`${BASE}/watch/${j.streamId}`);
  await page.waitForFunction(() => { const v = document.querySelector("video"); return v && v.readyState >= 2 && v.currentTime > 0.2; }, null, { timeout: 15000 });
  const firstFrameMs = Date.now() - t0;
  check("first frame < 5 s", firstFrameMs < 5000, `${firstFrameMs}ms`);
  await page.waitForFunction(() => document.querySelector("video").currentTime > 3, null, { timeout: 10000 });
  const dur = await page.evaluate(() => document.querySelector("video").duration);
  const tSeek = Date.now();
  await page.evaluate((d) => { const v = document.querySelector("video"); v.currentTime = d * 0.5; }, dur);
  await page.waitForFunction((d) => { const v = document.querySelector("video"); return !v.seeking && v.currentTime > d * 0.5 + 0.5 && !v.paused; }, dur, { timeout: 10000 });
  const seekMs = Date.now() - tSeek;
  check("seek to 50 % resumes playback < 3 s", seekMs < 3000, `${seekMs}ms (duration ${Math.round(dur)} s)`);
  await sleep(1500);
  await page.evaluate(() => document.querySelector("video").pause());
  const totalMs = Date.now() - t0;
  check("total real playback ≤ 20 s", totalMs <= BUDGET_MS, `${totalMs}ms`);
  check("CDN answered with 206 Partial Content (Range) and no error status", media.some((m) => m.status === 206) && media.every((m) => m.status === 206 || m.status === 200), `responses: ${media.map((m) => m.status).join(",")}`);
  const hb = await (await ctx.request.get(BASE + "/api/progress/continue")).json();
  note(`continue row after the smoke: ${hb.items.find((i) => i.mediaKey === MOVIE)?.positionS ?? "-"} s saved`);
  note(`timings: resolve ${resolveMs} ms · first frame ${firstFrameMs} ms · seek ${seekMs} ms · total ${totalMs} ms · media responses ${media.length}`);
  await page.goto("about:blank");
  await ctx.request.post(BASE + "/api/dev/seed", { data: { fixture: "progress", rows: [] } }).catch(() => {});
  await browser.close();
  report.finish();
}

main().catch((err) => { console.error(err); process.exit(1); });
