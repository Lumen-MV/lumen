// Screenshot runner: reproduces every mockup state against a RUNNING dev server (LUMEN_SCENARIOS=1)
// and writes qa/real-<page>-<state>[-m].png at 1440×900 and 390×844.
//   node scripts/shoot-states.mjs [--base http://localhost:3000] [--only state1,state2] [--viewport desktop|mobile]
//                                 [--mock "<path to spikes/web-mockup>"]   → also writes qa/mock-<page>-<state>[-m].png
// Admin credentials are read from .env.local (never printed). Fixtures are seeded through POST /api/dev/seed.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, request } from "@playwright/test";
import { ROUTINES as PHASE1 } from "./shoot-states-routines.mjs";
import { ROUTINES as PHASE2_HOME_BROWSE } from "./shoot-states-routines-phase2.mjs";
import { ROUTINES as PHASE2_DETAIL } from "./shoot-states-routines-phase2-detail.mjs";
import { ROUTINES as PHASE3, SETUPS as PHASE3_SETUPS } from "./shoot-states-routines-phase3.mjs";
import { ROUTINES as PHASE4, SETUPS as PHASE4_SETUPS } from "./shoot-states-routines-phase4.mjs";
import { ROUTINES as PHASE5, SETUPS as PHASE5_SETUPS } from "./shoot-states-routines-phase5.mjs";
import { ROUTINES as PHASE6, SETUPS as PHASE6_SETUPS } from "./shoot-states-routines-phase6.mjs";
import { composeMockMobileFrame } from "./shoot-mobile-frame-composite.mjs";

/** Routines are keyed `page:state` (Phase 2+) or bare `state` (Phase 1); state names repeat across pages (loading, empty…). */
const ROUTINES = { ...PHASE1, ...PHASE2_HOME_BROWSE, ...PHASE2_DETAIL, ...PHASE3, ...PHASE4, ...PHASE5, ...PHASE6 };
const routineFor = (entry) => ROUTINES[`${entry.page}:${entry.state}`] ?? ROUTINES[entry.state];

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const BASE = opt("base", "http://localhost:3000");
const ONLY = opt("only", "") ? new Set(opt("only", "").split(",")) : null;
const VIEWPORT_FILTER = opt("viewport", "");
const MOCK_DIR = opt("mock", "");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "qa");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts", "states-manifest.json"), "utf8"));

function readEnvLocal() {
  const env = {};
  for (const file of [".env.local", ".env"]) {
    const p = path.join(ROOT, file);
    if (!fs.existsSync(p)) continue;
    for (const raw of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const k = line.slice(0, line.indexOf("=")).trim();
      let v = line.slice(line.indexOf("=") + 1).trim();
      if (/^(".*"|'.*')$/.test(v)) v = v.slice(1, -1);
      if (!(k in env)) env[k] = v;
    }
  }
  return env;
}

const envFile = readEnvLocal();
const ADMIN = { username: envFile.ADMIN_USERNAME, password: envFile.ADMIN_PASSWORD };
if (!ADMIN.username || !ADMIN.password) { console.error("ADMIN_USERNAME / ADMIN_PASSWORD missing in .env.local"); process.exit(1); }

async function postJson(requestCtx, p, data) {
  const res = await requestCtx.post(BASE + p, { data });
  if (!res.ok()) throw new Error(`${p} → ${res.status()} ${await res.text()}`);
  return res.json().catch(() => ({}));
}

/** Separate admin-only API context for /api/dev/seed (admin session required), independent of the page's cookies. */
async function makeSeeder() {
  const req = await request.newContext();
  await postJson(req, "/api/auth/login", { username: ADMIN.username, password: ADMIN.password, remember: false });
  return {
    seed: (fixture) => postJson(req, "/api/dev/seed", fixture),
    get: async (p) => { const res = await req.get(BASE + p); return res.json().catch(() => ({})); },
    /** admin-context POST (JSON) for setups that mutate through a real route (device-token rotate) */
    post: (p, data) => postJson(req, p, data ?? {}),
    close: async () => { await req.post(BASE + "/api/auth/logout").catch(() => {}); await req.dispose(); },
  };
}

/** Shared helpers handed to each routine. `ctx` = the browser context whose cookies the page uses. */
function makeApi(ctx, seeder) {
  const post = (p, data) => postJson(ctx.request, p, data);
  return {
    base: BASE,
    admin: ADMIN,
    member: { username: "bao", password: "Bao123456", displayName: "Bảo" },
    seed: seeder.seed,
    /** admin-context GET / POST (JSON) for setups that need live data, e.g. a title's release hashes */
    get: seeder.get,
    post: seeder.post,
    scenario: (flags) => post("/api/dev/scenario", { flags }),
    login: (u, p) => post("/api/auth/login", { username: u, password: p, remember: true }),
    loginFail: (u, p) => ctx.request.post(BASE + "/api/auth/login", { data: { username: u, password: p, remember: true } }),
    // real logout so no orphan `sessions` rows are left behind, then drop the cookie jar
    logout: async () => { await ctx.request.post(BASE + "/api/auth/logout").catch(() => {}); await ctx.clearCookies(); },
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  };
}

async function settle(page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
}

async function applySetup(api, setup = [], fx) {
  for (const s of setup) {
    if (s === "reset-rate-limit") await api.seed({ fixture: "reset-rate-limit" });
    else if (s === "user:khang-disabled") await api.seed({ fixture: "user", username: "khang", displayName: "Khang", password: "KhangPass123", disabled: true, onboarded: true });
    else if (s === "user:owner") await api.seed({ fixture: "user", username: "owner", displayName: "Owner", password: "OwnerPass123", onboarded: true });
    else if (s === "delete-user:bao") await api.seed({ fixture: "delete-user", username: "bao" });
    else if (s === "invite:valid") fx.validToken = (await api.seed({ fixture: "invite", state: "valid" })).token;
    else if (s === "invite:expired") fx.expiredToken = (await api.seed({ fixture: "invite", state: "expired" })).token;
    else if (s === "notifications") await api.seed({ fixture: "notifications" });
    else if (s === "clear-user-media") await api.seed({ fixture: "clear-user-media" });
    else if (s === "clear-tmdb-cache") await api.seed({ fixture: "clear-tmdb-cache" });
    else if (PHASE3_SETUPS[s]) await PHASE3_SETUPS[s](api, fx);
    else if (PHASE4_SETUPS[s]) await PHASE4_SETUPS[s](api, fx);
    else if (PHASE5_SETUPS[s]) await PHASE5_SETUPS[s](api, fx);
    else if (PHASE6_SETUPS[s]) await PHASE6_SETUPS[s](api, fx);
    else throw new Error(`unknown setup ${s}`);
  }
}

async function shootViewport(browser, vpName, vp, seeder) {
  const suffix = vpName === "mobile" ? "-m" : "";
  const ctx = await browser.newContext({ viewport: vp, isMobile: vpName === "mobile", hasTouch: vpName === "mobile", locale: "vi-VN" });
  const api = makeApi(ctx, seeder);
  const fx = { invalidToken: "x".repeat(32) };
  // clean slate per viewport: fresh member, disabled user, no rate-limit, no scenario flags
  await api.seed({ fixture: "delete-user", username: "bao" });
  await api.seed({ fixture: "reset-rate-limit" });
  await api.seed({ fixture: "clear-notifications" });
  await api.seed({ fixture: "clear-cloud-jobs" });
  await api.seed({ fixture: "clear-views" });
  await api.seed({ fixture: "progress", rows: [] });
  await api.scenario([]);
  const page = await ctx.newPage();
  const results = [];
  for (const entry of manifest.states) {
    if (ONLY && !ONLY.has(entry.state) && !ONLY.has(`${entry.page}:${entry.state}`)) continue;
    const file = path.join(OUT, `real-${entry.page}-${entry.state}${suffix}.png`);
    let c = null;
    try {
      await applySetup(api, entry.setup, fx);
      if (entry.scenario) await api.scenario(entry.scenario);
      const url = BASE + entry.url.replace(/\{(\w+)\}/g, (_, k) => fx[k] ?? "");
      const routine = routineFor(entry);
      if (!routine) throw new Error(`no routine for ${entry.page}:${entry.state}`);
      c = { page, api, url, settle, fx, entry, afterShot: null, cleanup: null };
      await routine(c);
      await page.screenshot({ path: file });
      if (c.afterShot) await c.afterShot(); // e.g. let a deliberately slowed request finish
      results.push(`ok   ${path.basename(file)}`);
      if (entry.scenario) await api.scenario([]);
    } catch (err) {
      results.push(`FAIL ${path.basename(file)}: ${err.message.split("\n")[0]}`);
      await page.screenshot({ path: file.replace(".png", ".FAILED.png") }).catch(() => {});
    } finally {
      await page.unrouteAll({ behavior: "wait" }).catch(() => {});
      if (c?.cleanup) await c.cleanup().catch(() => {}); // runs even when the state failed (e.g. undo a persisted setting)
    }
  }
  await api.logout();
  await ctx.close();
  return results;
}

async function shootMockups(browser, vpName, vp) {
  const suffix = vpName === "mobile" ? "-m" : "";
  const ctx = await browser.newContext({ viewport: vp, isMobile: vpName === "mobile", hasTouch: vpName === "mobile" });
  const page = await ctx.newPage();
  const results = [];
  for (const entry of manifest.states) {
    if (ONLY && !ONLY.has(entry.state) && !ONLY.has(`${entry.page}:${entry.state}`)) continue;
    const file = path.join(OUT, `mock-${entry.page}-${entry.state}${suffix}.png`);
    const fileUrl = "file:///" + path.join(MOCK_DIR, `${entry.page}.html`).replace(/\\/g, "/") + `?state=${entry.state}&bare=1`;
    try {
      if (entry.page === "mobile-frame") {
        // mobile-frame.html embeds detail / player in their default states; compose the mock from the sheet + popover states instead
        await composeMockMobileFrame(page, MOCK_DIR, file);
        results.push(`ok   ${path.basename(file)}`);
        continue;
      }
      await page.goto(fileUrl);
      await settle(page);
      await page.screenshot({ path: file });
      results.push(`ok   ${path.basename(file)}`);
    } catch (err) {
      results.push(`FAIL ${path.basename(file)}: ${err.message.split("\n")[0]}`);
    }
  }
  await ctx.close();
  return results;
}

async function main() {
  const health = await fetch(BASE + "/api/health").then((r) => r.ok).catch(() => false);
  if (!health) { console.error(`Dev server not reachable at ${BASE} (start: LUMEN_SCENARIOS=1 npm run dev)`); process.exit(1); }
  fs.mkdirSync(OUT, { recursive: true });
  // autoplay must not depend on Playwright evaluate timing (its first evaluate carries the user gesture): real viewers arrive by a click + router.push
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  const seeder = await makeSeeder();
  const all = [];
  for (const [vpName, vp] of Object.entries(manifest.viewports)) {
    if (VIEWPORT_FILTER && VIEWPORT_FILTER !== vpName) continue;
    all.push(...(await shootViewport(browser, vpName, vp, seeder)));
    if (MOCK_DIR) all.push(...(await shootMockups(browser, vpName, vp)));
  }
  await seeder.close();
  await browser.close();
  console.log(all.join("\n"));
  const failed = all.filter((l) => l.startsWith("FAIL")).length;
  console.log(`\n${all.length - failed}/${all.length} screenshots ok → ${OUT}`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
