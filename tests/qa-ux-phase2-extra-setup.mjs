// Shared Playwright setup for the independent Phase 2 UX scripts: admin context with console capture
// (errors / warnings / pageerrors / network-failed buckets), scenario + seed helpers, screenshots to qa/extra-*.png.
import path from "node:path";
import { chromium } from "@playwright/test";
import { adminCreds, makeReporter, readEnv } from "./qa-shared-helpers.mjs";
import { ROOT, sleep } from "./qa-phase2-extra-helpers.mjs";

export { sleep };
export const QA = path.join(ROOT, "qa");
const args = process.argv.slice(2);
export const BASE = args.includes("--base") ? args[args.indexOf("--base") + 1] : "http://localhost:3000";
const ADMIN = adminCreds(readEnv(ROOT));
export const report = makeReporter();
export const { check, note } = report;

export async function launch(viewport = { width: 1440, height: 900 }, extra = {}) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport, locale: "vi-VN", ...extra });
  const page = await ctx.newPage();
  const log = { errors: [], warnings: [], pageerrors: [], network: [] };
  const where = () => page.url().replace(BASE, "");
  page.on("console", (m) => {
    const text = m.text();
    if (/Failed to load resource/.test(text)) return log.network.push(`${where()} :: ${text.slice(0, 160)}`);
    if (m.type() === "error") log.errors.push(`${where()} :: ${text.slice(0, 220)}`);
    else if (m.type() === "warning") log.warnings.push(`${where()} :: ${text.slice(0, 220)}`);
  });
  page.on("pageerror", (e) => log.pageerrors.push(`${where()} :: ${String(e).slice(0, 220)}`));
  const r = await ctx.request.post(BASE + "/api/auth/login", { data: { username: ADMIN.u, password: ADMIN.p, remember: false } });
  if (!r.ok()) { console.error("admin login failed", r.status()); process.exit(2); }
  const scenario = async (flags) => (await ctx.request.post(BASE + "/api/dev/scenario", { data: { flags } })).status();
  const seed = async (fixture) => (await ctx.request.post(BASE + "/api/dev/seed", { data: { fixture } })).status();
  const api = async (p) => (await ctx.request.get(BASE + p)).json();
  const goto = async (p, opts = {}) => { const res = await page.goto(BASE + p, { waitUntil: "networkidle", ...opts }); return res?.status(); };
  const shot = (name) => page.screenshot({ path: path.join(QA, `extra-${name}.png`) });
  await scenario([]);
  const close = async () => { await ctx.request.post(BASE + "/api/auth/logout").catch(() => {}); await browser.close(); }; // real logout → no orphan `sessions` rows
  return { browser, ctx, page, log, scenario, seed, api, goto, shot, close };
}

export const text = (page, sel) => page.textContent(sel).then((t) => (t ?? "").trim());
export const count = (page, sel) => page.$$(sel).then((a) => a.length);
export const css = (page, sel, prop) => page.$eval(sel, (el, p) => getComputedStyle(el).getPropertyValue(p), prop);

/**
 * Prints console buckets as checks/notes. Errors + pageerrors fail; warnings fail unless they match `allowWarnings`
 * (handled failures the app logs with console.warn by design, e.g. under the tmdb-down scenario) — those become a note.
 */
export function reportConsole(log, label, allowWarnings = null) {
  check(`${label}: 0 console errors`, log.errors.length === 0, log.errors.slice(0, 4).join(" | "));
  check(`${label}: 0 page errors`, log.pageerrors.length === 0, log.pageerrors.slice(0, 4).join(" | "));
  const allowed = allowWarnings ? log.warnings.filter((w) => allowWarnings.test(w)) : [];
  const unexpected = log.warnings.filter((w) => !allowed.includes(w));
  check(`${label}: 0 unexpected console warnings`, unexpected.length === 0, unexpected.slice(0, 4).join(" | "));
  if (allowed.length) note(`${label}: expected warnings (${allowed.length}): ${[...new Set(allowed.map((w) => w.slice(0, 90)))].join(" | ")}`);
  if (log.network.length) note(`${label}: network-failed lines (${log.network.length}): ${[...new Set(log.network)].slice(0, 4).join(" | ")}`);
}
