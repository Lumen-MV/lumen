// Phase 3 extra picker UX checks (fix round 1; moved from the tester's focus-and-wrap script): initial focus + Enter semantics,
// 4K switch isolation, even row heights with 4K on, sort menu, listbox a11y + aria-live, torbox-down keeps link-ready rows
// playable + neutral hero, `.rec` on the downloading best row. RUNNING dev server with LUMEN_SCENARIOS=1; admin creds from .env.local.
//   node tests/qa-ux-phase3-extra-picker.mjs [--base …]
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
const MOVIE = `${BASE}/movie/634649`;
const ROW = ".modal .box .src[data-hash]";

const activeInfo = (page) => page.evaluate(() => { const a = document.activeElement; return { tag: a?.tagName.toLowerCase(), role: a?.getAttribute("role"), hash: a?.getAttribute("data-hash"), toggle: a?.getAttribute("data-toggle") }; });
async function openPicker(page) {
  await page.waitForSelector('[data-primary]:not([data-primary="loading"])', { timeout: 30000 });
  await page.click('[data-action="pick-other"]');
  await page.waitForSelector(ROW);
  await sleep(150);
}

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "vi-VN" });
  const api = ctx.request;
  const errors = [];
  ctx.on("page", (p) => p.on("console", (m) => { if (m.type() === "error" && !/status of (404|503)/.test(m.text())) errors.push(m.text().slice(0, 160)); }));
  await api.post(BASE + "/api/auth/login", { data: { username: ADMIN.u, password: ADMIN.p, remember: true } });
  await api.post(BASE + "/api/dev/scenario", { data: { flags: [] } });
  await api.post(BASE + "/api/dev/seed", { data: { fixture: "clear-cloud-jobs" } });
  await api.patch(BASE + "/api/me/settings", { data: { show_4k: false } });
  const show4k = async () => (await (await api.get(BASE + "/api/me")).json()).settings.show_4k;
  const page = await ctx.newPage();

  // ---------------------------------------------------------------- focus + Enter + switch isolation
  await page.goto(MOVIE);
  await openPicker(page);
  const focused = await activeInfo(page);
  check("picker opens with focus on the highlighted row (option), never the 4K switch", focused.role === "option" && focused.hash !== null && focused.toggle === null, JSON.stringify(focused));
  check("listbox a11y: role=listbox, exactly one aria-selected option = the focused row", (await page.$('.modal [role="listbox"]')) !== null && (await page.$$('.modal [role="option"][aria-selected="true"]')).length === 1 && (await page.getAttribute('.modal [role="option"][aria-selected="true"]', "data-hash")) === focused.hash);
  check("roving tabindex: only the highlighted row is a tab stop", (await page.$$eval(ROW, (els) => els.filter((e) => e.tabIndex === 0).length)) === 1);
  let resolves = 0;
  await page.route("**/api/play/resolve", (r) => { resolves++; r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "TORBOX_UNREACHABLE" }) }); });
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  const afterArrows = await activeInfo(page);
  check("ArrowDown moves focus with the highlight", afterArrows.role === "option" && afterArrows.hash === (await page.getAttribute(`${ROW} >> nth=2`, "data-hash")));
  await page.keyboard.press("Enter");
  await sleep(600);
  check("Enter on a row = that row's primary action only; show_4k untouched", resolves === 1 && (await show4k()) === false && (await page.getAttribute('[data-toggle="4k"]', "aria-checked")) === "false", `resolves=${resolves} show_4k=${await show4k()}`);
  await page.focus('[data-toggle="4k"]');
  await page.keyboard.press("Enter");
  await sleep(500);
  check("Enter on the 4K switch toggles only the switch (no row action)", resolves === 1 && (await show4k()) === true && (await page.getAttribute('[data-toggle="4k"]', "aria-checked")) === "true");
  await page.waitForSelector(`${ROW} .q:has-text("2160p")`, { timeout: 30000 });
  await page.keyboard.press(" ");
  await sleep(500);
  check("Space on the 4K switch toggles it back (no row action, no page scroll side effect)", resolves === 1 && (await show4k()) === false);
  await page.waitForFunction(() => !document.querySelector(".modal .box .src[data-hash] .q")?.textContent.includes("2160p"), null, { timeout: 30000 });
  await page.unrouteAll({ behavior: "wait" });

  // ---------------------------------------------------------------- sort menu + chips by keyboard
  await page.click(".modal .filt .sort");
  await page.waitForSelector('.menu2 [role="menuitem"]');
  check("sort opens a menu with Đề xuất / Dung lượng / Seeders", (await page.$$eval('.menu2 [role="menuitem"]', (els) => els.map((e) => e.textContent.trim()).join("|"))) === "Đề xuất|Dung lượng|Seeders");
  await page.click('.menu2 [role="menuitem"]:has-text("Dung lượng")');
  await sleep(150);
  const sizes = await page.$$eval(`${ROW} .l1`, (els) => els.map((e) => Number((e.textContent.match(/([\d.]+) GB/) || [])[1] || 0)));
  check("Dung lượng → data-sort=size + descending sizes", (await page.getAttribute(".modal .filt .sort", "data-sort")) === "size" && sizes.every((v, i) => i === 0 || v <= sizes[i - 1]), sizes.slice(0, 5).join(","));
  await page.focus('.modal .filt [data-filter="direct"]');
  await page.keyboard.press(" ");
  await sleep(150);
  check("Space on a filter chip activates it (only direct rows)", (await page.$$eval(ROW, (els) => els.length > 0 && els.every((e) => e.dataset.play === "direct"))) && (await page.getAttribute('.modal .filt [data-filter="direct"]', "aria-pressed")) === "true");
  await page.click('.modal .filt [data-filter="all"]');
  await page.keyboard.press("Escape");

  // ---------------------------------------------------------------- even rows with 4K on
  await api.patch(BASE + "/api/me/settings", { data: { show_4k: true } });
  await page.goto(MOVIE);
  await openPicker(page);
  await page.waitForSelector(`${ROW} .q:has-text("2160p")`, { timeout: 30000 });
  check("4K on: 2160p rows are shown but the recommended (first) row is still the cached 1080p direct", (await page.$$(`${ROW} .q:has-text("2160p")`)).length > 0 && /1080p/.test(await page.textContent(`${ROW} >> nth=0 >> .q`)) && (await page.getAttribute(`${ROW} >> nth=0`, "data-cache")) === "cached");
  check("4K on: ≥ 8 1080p rows remain", (await page.$$(`${ROW} .q:has-text("1080p")`)).length >= 8);
  const wrapped = await page.$$eval(`${ROW} .q small`, (els) => els.filter((e) => e.getBoundingClientRect().height > 18).map((e) => e.textContent));
  const heights = [...new Set(await page.$$eval(`${ROW}:not(.rec)`, (els) => els.map((e) => Math.round(e.getBoundingClientRect().height))))];
  check("format label never wraps → uniform row heights (the .rec row is taller by design: 'Đề xuất' under the quality)", wrapped.length === 0 && heights.length === 1, `wrapped=${wrapped.join(",")} heights=${heights.join("/")}`);
  await page.keyboard.press("Escape");
  await api.patch(BASE + "/api/me/settings", { data: { show_4k: false } });

  // ---------------------------------------------------------------- torbox-down: link-ready row stays playable, hero neutral
  if (process.env.QA_SKIP_REAL === "1") report.note("QA_SKIP_REAL=1: outage link-ready checks need a real resolve (requestdl) — skipped (4 checks)");
  else {
    const best = (await (await api.get(BASE + "/api/sources?mediaKey=movie:634649")).json()).best;
    const primed = await api.post(BASE + "/api/play/resolve", { data: { mediaKey: "movie:634649", hash: best.hash } }); // torrent_cache + link memo (≤ 1 requestdl)
    check("prime: resolve best → 200", primed.status() === 200, String(primed.status()));
    await api.post(BASE + "/api/dev/scenario", { data: { flags: ["torbox-down"] } });
    await page.goto(MOVIE);
    await page.waitForSelector('[data-primary="down"]', { timeout: 30000 });
    check("hero during the outage is neutral: '▶ Chọn bản phát' + grey facts, no cache marker", (await page.textContent('[data-primary="down"]')) === "▶ Chọn bản phát" && (await page.$('.facts .match')) === null && /Không kết nối được Torbox/.test(await page.textContent('[data-facts="down"]')));
    await page.click('[data-primary="down"]');
    await page.waitForSelector(".modal .banner.err");
    check("outage picker: best row keeps ▶ Phát enabled (link cached), other rows disabled", (await page.isEnabled(`${ROW}[data-hash="${best.hash}"] [data-action="play"]`)) && (await page.getAttribute(`${ROW}[data-hash="${best.hash}"]`, "data-link-ready")) === "true" && (await page.$$eval(`${ROW}:not([data-link-ready]) .act button`, (els) => els.length > 0 && els.every((b) => b.disabled))));
    await page.click(`${ROW}[data-hash="${best.hash}"] [data-action="play"]`);
    await page.waitForURL(/\/watch\/[0-9a-f]{32}$/, { timeout: 20000 });
    check("outage: ▶ Phát on the link-ready row still reaches /watch (no TorBox call)", /\/watch\//.test(page.url()));
    await api.post(BASE + "/api/dev/scenario", { data: { flags: [] } });
  }

  // ---------------------------------------------------------------- "Lần trước": pick a row → reload → tag + primary label → Quên lựa chọn
  // all-uncached (no TorBox) + two sim-ready jobs make two cached rows; play-sample keeps ▶ Phát off TorBox
  await api.delete(BASE + "/api/sources/prefs?mediaKey=movie:634649");
  await api.post(BASE + "/api/dev/scenario", { data: { flags: ["all-uncached", "play-sample"] } });
  const plain = (await (await api.get(BASE + "/api/sources?mediaKey=movie:634649")).json()).releases;
  const rowA = plain[0];
  const rowB = plain.find((r) => r.qualityLabel !== rowA.qualityLabel && r.playClass !== "app") ?? plain.find((r) => r.hash !== rowA.hash && r.playClass !== "app") ?? plain[1];
  await api.post(BASE + "/api/dev/seed", { data: { fixture: "cloud-jobs", mediaKey: "movie:634649", title: "Người Nhện", jobs: [{ hash: rowA.hash, state: "ready" }, { hash: rowB.hash, state: "ready" }] } });
  const seededList = await (await api.get(BASE + "/api/sources?mediaKey=movie:634649")).json();
  const bestHash = seededList.best?.hash;
  check("setup: two sim-cached rows, best cached, no pref", seededList.best?.cacheState === "cached" && seededList.releases.filter((r) => r.cacheState === "cached").length === 2 && seededList.preferredHash === null, `best=${bestHash?.slice(0, 8)} A=${rowA.hash.slice(0, 8)} B=${rowB.hash.slice(0, 8)}`);
  const pickHash = bestHash === rowB.hash ? rowA.hash : rowB.hash;
  const pickQuality = seededList.releases.find((r) => r.hash === pickHash)?.qualityLabel;
  await page.goto(MOVIE);
  await openPicker(page);
  const labelBefore = await page.textContent('[data-primary]');
  check("no pref: primary = best row, no 'Lần trước' tag, no 'Quên lựa chọn' link", (await page.getAttribute('[data-primary]', "data-primary-hash")) === bestHash && (await page.$(`${ROW}[data-last-pick]`)) === null && (await page.$('.modal [data-action="forget-pref"]')) === null, labelBefore);
  await page.click(`${ROW}[data-hash="${pickHash}"] [data-action="play"]`);
  await page.waitForURL(/\/watch\/[0-9a-f]{32}/, { timeout: 20000 });
  check("▶ Phát on the other cached row reaches /watch (sample)", /\/watch\//.test(page.url()));
  await page.goto(MOVIE);
  await page.waitForSelector('[data-primary]:not([data-primary="loading"])', { timeout: 30000 });
  const labelAfter = await page.textContent('[data-primary]');
  check("reload: primary follows the remembered row (label shows its quality)", (await page.getAttribute('[data-primary]', "data-primary-hash")) === pickHash && (await page.getAttribute('[data-primary]', "data-preferred")) === "true" && labelAfter.includes(`· ${pickQuality}`), `${labelBefore} → ${labelAfter}`);
  check("no 'không còn sẵn' note while the pref applies", (await page.$('[data-pref-note]')) === null);
  await openPicker(page);
  const tagged = await page.$$eval(`${ROW}[data-last-pick]`, (els) => els.map((e) => ({ hash: e.dataset.hash, text: e.querySelector(".l1")?.textContent ?? "" })));
  check("picker: the remembered row carries the 'Lần trước' tag; focus + highlight land on it (ahead of .rec)", tagged.length === 1 && tagged[0].hash === pickHash && /Lần trước/.test(tagged[0].text) && (await activeInfo(page)).hash === pickHash && (await page.getAttribute('.modal [role="option"][aria-selected="true"]', "data-hash")) === pickHash, JSON.stringify(tagged));
  check("picker: 'Đề xuất' (.rec) stays on the best row", (await page.getAttribute(`${ROW}.rec`, "data-hash")) === bestHash);
  await page.click('.modal [data-action="forget-pref"]');
  await page.waitForFunction(() => !document.querySelector('.modal .src[data-last-pick]'), null, { timeout: 5000 });
  check("'Quên lựa chọn' removes the tag + the link", (await page.$('.modal [data-action="forget-pref"]')) === null && (await (await api.get(BASE + "/api/sources?mediaKey=movie:634649")).json()).preferredHash === null);
  await page.keyboard.press("Escape");
  await sleep(200);
  check("after forgetting, the primary is the best row again", (await page.getAttribute('[data-primary]', "data-primary-hash")) === bestHash && (await page.getAttribute('[data-primary]', "data-preferred")) === null);
  // a pref whose row is no longer cached: hero falls back to best + the small note; the picker still tags the row
  const staleHash = seededList.releases.find((r) => r.cacheState === "uncached")?.hash;
  await api.post(BASE + "/api/sources/prefs", { data: { mediaKey: "movie:634649", hash: staleHash } });
  await page.goto(MOVIE);
  await page.waitForSelector('[data-primary]:not([data-primary="loading"])', { timeout: 30000 });
  check("stale pref: primary = best, 'Bản đã chọn không còn sẵn, dùng bản đề xuất' note in the facts line", (await page.getAttribute('[data-primary]', "data-primary-hash")) === bestHash && /không còn sẵn/.test((await page.textContent('[data-pref-note="gone"]').catch(() => "")) ?? ""));
  await openPicker(page);
  check("stale pref: tagged in the picker but the highlight is the best row", (await page.getAttribute(`${ROW}[data-last-pick]`, "data-hash")) === staleHash && (await activeInfo(page)).hash === bestHash);
  await page.keyboard.press("Escape");
  await api.delete(BASE + "/api/sources/prefs?mediaKey=movie:634649");
  await api.post(BASE + "/api/dev/seed", { data: { fixture: "clear-cloud-jobs" } });
  await api.post(BASE + "/api/dev/scenario", { data: { flags: [] } });

  // ---------------------------------------------------------------- picker-progress: .rec on the downloading best row + aria-live
  await api.post(BASE + "/api/dev/scenario", { data: { flags: ["all-uncached", "cloud-sim=downloading:40:30"] } });
  await page.goto(MOVIE);
  await openPicker(page);
  const target = await page.getAttribute(`${ROW} >> nth=0`, "data-hash");
  await page.click(`${ROW}[data-hash="${target}"] [data-action="cloud"]`);
  await page.waitForSelector(`${ROW}[data-hash="${target}"][data-job="downloading"]`);
  check("downloading best row carries .rec (mock parity)", (await page.$(`${ROW}.rec[data-hash="${target}"][data-job="downloading"]`)) !== null);
  await page.waitForFunction((h) => /Đang tải (70|100)%/.test(document.querySelector(`.modal .src[data-hash="${h}"] .l1`)?.textContent ?? ""), target, { timeout: 15000 }).catch(() => {});
  const live = await page.textContent('.modal [aria-live="polite"]');
  check("aria-live region announces progress on 10 % steps", /đang tải \d0%/.test(live ?? ""), live);
  await page.waitForSelector(`${ROW}[data-hash="${target}"][data-cache="cached"]:not([data-job])`, { timeout: 30000 });
  await page.keyboard.press("Escape");
  await api.post(BASE + "/api/dev/scenario", { data: { flags: [] } });
  await api.post(BASE + "/api/dev/seed", { data: { fixture: "clear-cloud-jobs" } });
  check("0 console errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  note(`torbox calls this process: ${(await (await api.get(BASE + "/api/health")).json()).torbox?.calls}`);
  await ctx.close();
  await browser.close();
  report.finish();
}
main().catch((err) => { console.error(err); process.exit(1); });
