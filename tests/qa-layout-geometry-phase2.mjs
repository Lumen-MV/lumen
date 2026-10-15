// Layout fidelity beyond pixel %: measures element rects (x, y, w, h) + font on the real Phase-2 pages and the matching
// mockup states at 1440×900 and 390×844, and prints every selector whose geometry drifts > TOL px. Poster/title data is ignored.
//   node tests/qa-layout-geometry-phase2.mjs --mock "<path to spikes/web-mockup>" [--base http://localhost:3000] [--tol 2]
import path from "node:path";
import { chromium } from "@playwright/test";
import { adminCreds, readEnv } from "./qa-shared-helpers.mjs";
import { ROOT } from "./qa-phase2-extra-helpers.mjs";

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const BASE = opt("base", "http://localhost:3000");
const MOCK_DIR = opt("mock", "");
const TOL = Number(opt("tol", 2));
if (!MOCK_DIR) { console.error("--mock <dir> required"); process.exit(2); }
const ADMIN = adminCreds(readEnv(ROOT));
const mockUrl = (page, state) => "file:///" + path.join(MOCK_DIR, `${page}.html`).replace(/\\/g, "/") + `?state=${state}&bare=1`;

/** [label, real url, real prep, mock page, mock state, selectors] — selectors chosen for geometry, not data. */
const PAIRS = [
  ["index first-time", "/", null, "index", "first-time", ["header", "header .logo", "header nav", ".hero", ".hero .t", ".hero h1", ".hero .meta", ".hero .btn", ".hero .age", "section .h h2", ".top10", ".top10 .t10", ".t10 .num", ".t10 img", "section .row", ".row .card", ".row .card img", ".row .card .n", "footer", ".tabbar"]],
  ["browse default", "/movies", (p) => p.waitForSelector('.gridwrap[data-status="ready"] .card img'), "browse", "default", ["header", ".pagehd", ".pagehd h1", ".pagehd p", ".fbar", ".fbar .chip", ".fbar .tog", ".fbar .cnt", ".fbar .chip.mob", ".gridwrap", ".gridwrap .grid", ".grid .card", ".grid .card img", ".grid .card .n"]],
  ["search default", "/search?q=spider", (p) => p.waitForSelector(".gridwrap .card img"), "search", "default", [".pagehd h1", ".pagehd p", ".fbar", ".fbar .chip.on", ".fbar .chip", ".gridwrap .grid", ".grid .card"]],
  ["detail", "/movie/634649", (p) => p.waitForSelector(".detail h1"), "detail", "overview-en", [".detail", ".detail .in", ".detail h1", ".detail .acts", ".detail .acts .btn", ".detail .acts .btn.round", ".cols", ".facts", ".facts .pill", ".detail p", ".kv", "section .h h2", "section .row .card"]],
  ["series season-open", "/series/66732?s=4", async (p) => { await p.waitForSelector(".eps .ep img"); await p.click(".eps .dd"); await p.waitForSelector(".menu2.seasonmenu"); }, "series", "season-open", [".detail.series", ".detail h1", ".detail .acts", ".facts", ".kv", ".eps", ".eps .hd", ".eps .hd h2", ".eps .dd", ".menu2.seasonmenu", ".menu2.seasonmenu div", ".ep", ".ep .num", ".ep .th", ".ep .tx .n", ".ep .p"]],
];

const measure = (sels) => sels.map((s) => {
  const el = document.querySelector(s);
  if (!el) return { s, missing: true };
  const r = el.getBoundingClientRect(), c = getComputedStyle(el);
  if (r.width === 0 && r.height === 0) return { s, hidden: true };
  return { s, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), font: `${c.fontSize}/${c.lineHeight} ${c.fontWeight}`, pad: c.padding };
});

const browser = await chromium.launch();
let drift = 0, total = 0;
for (const [vpName, vp] of [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport: vp, isMobile: vpName === "mobile", hasTouch: vpName === "mobile", locale: "vi-VN" });
  await ctx.request.post(BASE + "/api/auth/login", { data: { username: ADMIN.u, password: ADMIN.p, remember: false } });
  await ctx.request.post(BASE + "/api/dev/scenario", { data: { flags: [] } });
  const page = await ctx.newPage();
  for (const [label, url, prep, mpage, mstate, sels] of PAIRS) {
    await page.goto(BASE + url, { waitUntil: "networkidle" });
    if (prep) await prep(page).catch((e) => console.log(`  (prep failed ${label}: ${String(e).slice(0, 80)})`));
    const real = await page.evaluate(measure, sels);
    await page.goto(mockUrl(mpage, mstate), { waitUntil: "load" });
    await page.waitForTimeout(300);
    const mock = await page.evaluate(measure, sels);
    console.log(`\n### ${vpName} · ${label}`);
    for (let i = 0; i < sels.length; i++) {
      const a = real[i], b = mock[i];
      total++;
      if (a.missing || b.missing || a.hidden || b.hidden) {
        if ((a.missing || a.hidden) !== (b.missing || b.hidden)) { drift++; console.log(`  DIFF ${a.s}: real ${a.missing ? "missing" : a.hidden ? "hidden" : "present"} vs mock ${b.missing ? "missing" : b.hidden ? "hidden" : "present"}`); }
        continue;
      }
      const d = ["x", "y", "w", "h"].filter((k) => Math.abs(a[k] - b[k]) > TOL).map((k) => `${k} ${a[k]}→${b[k]}`);
      const f = a.font !== b.font ? [`font ${a.font} vs ${b.font}`] : [];
      const p = a.pad !== b.pad ? [`pad ${a.pad} vs ${b.pad}`] : [];
      if (d.length || f.length || p.length) { drift++; console.log(`  DIFF ${a.s}: ${[...d, ...f, ...p].join(", ")} (real→mock)`); }
    }
  }
  await ctx.request.post(BASE + "/api/auth/logout");
  await ctx.close();
}
await browser.close();
console.log(`\n${total - drift}/${total} selector geometries match within ${TOL}px`);
