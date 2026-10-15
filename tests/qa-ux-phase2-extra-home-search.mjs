// Independent Phase 2 UX walkthrough, desktop 1440×900 — home (hero timing/arrows, chevrons, hover panel + its buttons,
// Top 10 numerals CSS, Xem tất cả targets, LCP, slow-net skeleton) and the search overlay / results page.
//   node tests/qa-ux-phase2-extra-home-search.mjs [--base http://localhost:3000]
import { BASE, check, count, css, launch, note, report, reportConsole, sleep, text } from "./qa-ux-phase2-extra-setup.mjs";

async function main() {
  const s = await launch();
  const { page } = s;
  await s.seed("clear-user-media");

  // ---------------------------------------------------------------- hero rotation interval, pause, arrows, dots
  await s.goto("/");
  const idx = () => page.getAttribute(".hero", "data-hero-index");
  const t0 = Date.now();
  const changes = [];
  let last = await idx();
  while (Date.now() - t0 < 17500 && changes.length < 2) {
    await sleep(100);
    const i = await idx();
    if (i !== last) { changes.push({ i, at: Date.now() - t0 }); last = i; }
  }
  const interval = changes.length === 2 ? changes[1].at - changes[0].at : NaN;
  check("hero rotates with ~8 s interval (two consecutive changes)", changes.length === 2 && Math.abs(interval - 8000) < 400, `changes ${JSON.stringify(changes)} interval ${interval} ms`);
  await page.hover(".hero");
  const before = await idx();
  await sleep(9000);
  check("hero paused while hovered for 9 s", (await idx()) === before && (await page.getAttribute(".hero", "data-paused")) === "true");
  check("arrows visible on hover (opacity 1)", (await css(page, ".hero-arrow.r", "opacity")) === "1");
  await page.click(".hero-arrow.r");
  const afterR = Number(await idx());
  await page.click(".hero-arrow.l");
  check("arrow › / ‹ step the hero index", afterR === (Number(before) + 1) % 5 && Number(await idx()) === Number(before));
  await page.mouse.move(10, 890);
  await page.waitForFunction(() => getComputedStyle(document.querySelector(".hero-arrow.r")).opacity === "0", null, { timeout: 2000 }).catch(() => {}); // opacity transition .2s
  check("arrows hidden when not hovering (opacity 0)", (await css(page, ".hero-arrow.r", "opacity")) === "0", await css(page, ".hero-arrow.r", "opacity"));
  check("hero overview clamps to 2 lines", (await css(page, ".hero p", "-webkit-line-clamp")) === "2");
  const logo = await page.$(".hero h1 img.herologo");
  note(`hero title treatment: ${logo ? "TMDB logo image" : "text h1"} (mockup shows text h1)`);
  // Phase 3 fills the "● Đã cache" / nothing slot in front of the year (title_sources)
  check("hero meta: [● Đã cache] year · runtime · HD · age · ★", /^(●Đãcache)?\d{4}\d+h\d+mHD(\d{2}\+|P)★\d\.\d$/.test((await text(page, ".hero .meta")).replace(/\s+/g, "")), await text(page, ".hero .meta"));

  // ---------------------------------------------------------------- row chevrons page by the visible width
  const row = 'section:has(h2:text-is("Phim bộ thịnh hành"))';
  await page.hover(`${row} .row`);
  await page.waitForFunction((el) => el && getComputedStyle(el).opacity === "1", await page.$(`${row} .chev.r`), { timeout: 2000 }).catch(() => {}); // element handle: Playwright text selectors are not valid for querySelector
  check("chevron › visible on row hover", (await css(page, `${row} .chev.r`, "opacity")) === "1", await css(page, `${row} .chev.r`, "opacity"));
  const geo = async () => page.$eval(`${row} .row`, (el) => ({ left: el.scrollLeft, width: el.clientWidth }));
  const g0 = await geo();
  await page.click(`${row} .chev.r`);
  await sleep(900);
  const g1 = await geo();
  check("chevron › scrolls ≈ one page (clientWidth)", Math.abs(g1.left - g0.width) < 40, `scrolled ${g1.left} px, page ${g0.width} px`);
  check("chevron ‹ appears once scrolled", (await page.$(`${row} .chev.l`)) !== null);
  await page.click(`${row} .chev.l`);
  await sleep(900);
  check("chevron ‹ scrolls back to 0", (await geo()).left === 0);

  // ---------------------------------------------------------------- Top 10 numerals (CSS vs mockup)
  const num = await page.$eval(".t10 .num", (el) => { const c = getComputedStyle(el); return { fs: c.fontSize, stroke: c.webkitTextStrokeWidth, strokeColor: c.webkitTextStrokeColor, color: c.color, weight: c.fontWeight, w: el.offsetWidth, ff: c.fontFamily }; });
  const img = await page.$eval(".t10 img", (el) => ({ w: el.offsetWidth, h: el.offsetHeight }));
  const t10 = await page.$eval(".t10", (el) => ({ w: el.offsetWidth, h: el.offsetHeight }));
  check("Top 10 numeral 236px / stroke 5px #6b6b6b / fill #141414 / 900", num.fs === "236px" && num.stroke === "5px" && num.strokeColor === "rgb(107, 107, 107)" && num.color === "rgb(20, 20, 20)" && num.weight === "900", JSON.stringify(num));
  check("Top 10 poster 140×210 inside 232×232 cell", img.w === 140 && img.h === 210 && t10.w === 232 && t10.h === 232, JSON.stringify({ img, t10 }));
  check("Top 10 numerals 1..10 in order", (await page.$$eval(".t10 .num", (els) => els.map((e) => e.textContent.trim()).join(","))) === "1,2,3,4,5,6,7,8,9,10");
  // Phase 3 appends "Mới thêm vào cache" (title_sources) after Anime, like the mockup; it has no "Xem tất cả ›"
  check("rows in mockup order", /^Top 10 phim lẻ hôm nay\|Phim bộ thịnh hành\|Dành riêng cho bạn\|Anime(\|Mới thêm vào cache)?$/.test(await page.$$eval("section .h h2", (els) => els.map((e) => e.textContent.trim()).join("|"))));
  check("Xem tất cả › targets", (await page.$$eval("section .h a", (els) => els.map((e) => e.getAttribute("href")).join(","))) === "/movies,/series,/movies,/anime");
  check("footer attribution + members + version", /^Dữ liệu phim từ TMDB\. Lumen không được TMDB chứng nhận\. · Thành viên: \d+ · Phiên bản 1\.0$/.test(await text(page, "footer")));

  // ---------------------------------------------------------------- hover panel + its buttons
  const card = 'section:has(h2:text-is("Dành riêng cho bạn")) .card >> nth=2';
  await page.hover(card);
  await sleep(150);
  check("no hover panel at 150 ms", (await page.$(".card.hov .hoverpanel")) === null);
  await sleep(400);
  check("hover panel at ≥ 400 ms", (await page.$(".card.hov .hoverpanel")) !== null);
  for (let i = 0; i < 30 && /…/.test(await text(page, ".card.hov .hoverpanel .m")); i++) await sleep(150);
  const metas = await page.$$eval(".card.hov .hoverpanel .m", (els) => els.map((e) => e.textContent.trim()));
  check("hover meta '[Đã cache ·] year · runtime · ★ r' + genres", /^(Đã cache · )?\d{4} · (\d+h \d+m|\d+ mùa) · ★ \d\.\d$/.test(metas[0] ?? "") && (metas[1] ?? "").length > 0 && !/…/.test(metas[0] ?? ""), metas.join(" / "));
  await page.waitForFunction(() => /matrix\(1\.25/.test(getComputedStyle(document.querySelector(".card.hov")).transform), null, { timeout: 2000 }).catch(() => {}); // scale transition
  check("hover card scaled 1.25", /matrix\(1\.25/.test(await css(page, ".card.hov", "transform")), await css(page, ".card.hov", "transform"));
  await s.shot("hover-panel");
  const acts = ".card.hov .hoverpanel .acts span";
  check("hover actions ▶ ＋ 👍 ⌄", (await page.$$eval(acts, (els) => els.map((e) => e.textContent.trim()).join(""))) === "▶＋👍⌄");
  const hovKey = await page.getAttribute(".card.hov", "data-media-key");
  await page.click(`${acts} >> nth=1`);
  await sleep(500);
  check("＋ → toast '✓ Đã thêm … vào danh sách' + Hoàn tác, icon ✓", /^✓ Đã thêm ".+" vào danh sách/.test(await text(page, ".toasts .toast")) && (await text(page, `${acts} >> nth=1`)) === "✓");
  await page.click(`${acts} >> nth=1`);
  await sleep(400);
  check("＋ again → ✓ back to ＋ (DELETE)", (await text(page, `${acts} >> nth=1`)) === "＋");
  await page.click(`${acts} >> nth=2`);
  await sleep(400);
  const panelAfterLike = (await page.$(".card.hov .hoverpanel")) !== null;
  check("P2-4: clicking a 2nd panel button (👍 after ＋) keeps the panel open (focus moves ＋→👍, card onBlur)", panelAfterLike);
  const rehover = async () => { await page.mouse.move(5, 850); await sleep(250); await page.hover(card); await page.waitForSelector(".card.hov .hoverpanel", { timeout: 5000 }); };
  if (!panelAfterLike) await rehover();
  const likedApi = async () => (await (await s.ctx.request.get(`${BASE}/api/catalog/meta?key=${encodeURIComponent(hovKey)}`)).json());
  const likeCls = await page.getAttribute(`${acts} >> nth=2`, "class");
  check("👍 → white (class w)", likeCls === "w", `class='${likeCls}'${panelAfterLike ? "" : " (panel re-opened → shows default state, see P1-2)"} meta=${JSON.stringify(await likedApi()).slice(0, 60)}`);
  await page.click(`${acts} >> nth=2`);
  await sleep(400);
  if (!(await page.$(".card.hov .hoverpanel"))) await rehover();
  check("👍 again → off", !(await page.getAttribute(`${acts} >> nth=2`, "class")));
  await rehover(); // fresh panel so focus is on <body>: clicking ⌄ while 👍 is focused blurs the card and unmounts the panel (P2-4)
  await page.click(`${acts} >> nth=3`);
  await page.waitForURL(/\/(movie|series)\/\d+/);
  await s.ctx.request.delete(`${BASE}/api/likes`, { data: { mediaKey: hovKey } }).catch(() => {});
  check("⌄ → detail page of the hovered card", page.url().endsWith(`/${hovKey.startsWith("movie") ? "movie" : "series"}/${hovKey.split(":")[1]}`), page.url());
  await page.goBack({ waitUntil: "networkidle" });
  check("Xem tất cả › (Anime) → /anime with header", await (async () => { await page.click('section:has(h2:text-is("Anime")) .h a'); await page.waitForURL(/\/anime$/); return (await text(page, ".pagehd h1")) === "Anime"; })());

  // ---------------------------------------------------------------- LCP (warm) + slow-net skeleton timing
  await s.goto("/");
  await s.goto("/");
  const lcp = await page.evaluate(() => new Promise((res) => { let v = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) v = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true }); setTimeout(() => res(Math.round(v)), 2500); }));
  check("home LCP (warm cache, local) < 2000 ms", lcp > 0 && lcp < 2000, `${lcp} ms`);
  await s.scenario(["slow-net"]);
  const ts = Date.now();
  await page.goto(BASE + "/", { waitUntil: "commit" });
  await page.waitForSelector(".skhero", { timeout: 15000 });
  const skAt = Date.now() - ts;
  await page.waitForSelector(".hero:not(.skhero)", { timeout: 60000 });
  const heroAt = Date.now() - ts;
  check("slow-net: hero skeleton shown ≥ 250 ms before content", heroAt - skAt >= 250, `skeleton at ${skAt} ms, hero at ${heroAt} ms`);
  await s.scenario([]);

  // ---------------------------------------------------------------- search overlay
  await s.goto("/");
  await page.evaluate(() => localStorage.removeItem("lumen.recentSearches"));
  await page.keyboard.press("/");
  await page.waitForSelector(".sov input");
  check("`/` opens overlay with focused input, no dropdown when empty + no recents", (await page.evaluate(() => document.activeElement === document.querySelector(".sov input"))) && (await page.$(".sov .dd")) === null);
  await page.type(".sov input", "a");
  await sleep(500);
  check("1 char → no request/results", (await page.$(".sov .dd")) === null);
  await page.fill(".sov input", "arcane");
  await page.waitForSelector('.sov[data-status="done"]');
  const apiArcane = await s.api("/api/catalog/search?q=arcane");
  check("≤ 8 results with <mark> on matched text", (await count(page, ".sov .dd .r")) <= 8 && (await count(page, ".sov .dd .r mark")) >= 1 && /arcane/i.test(await text(page, ".sov .dd .r mark")));
  const mark = await page.$eval(".sov .dd .r mark", (el) => { const c = getComputedStyle(el); return { bg: c.backgroundColor, color: c.color, weight: c.fontWeight }; });
  check("mark style: no background, white, bold", mark.bg === "rgba(0, 0, 0, 0)" && mark.color === "rgb(255, 255, 255)" && mark.weight === "700", JSON.stringify(mark));
  check("result meta 'year · Phim lẻ|Phim bộ · ★ r'", /^\d{4} · (Phim lẻ|Phim bộ) · ★ \d\.\d$/.test(await text(page, ".sov .dd .r .y")), await text(page, ".sov .dd .r .y"));
  check("Xem tất cả kết quả (N) ↵ = API counts.all", (await text(page, ".sov .more")) === `Xem tất cả kết quả (${apiArcane.counts.all}) ↵`, await text(page, ".sov .more"));
  await s.shot("search-overlay");
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/search\?q=arcane/);
  check("/search page: title, count, tabs with counts", (await text(page, ".pagehd h1")) === "Kết quả cho “arcane”" && (await text(page, ".pagehd p")) === `${apiArcane.counts.all} kết quả` && (await page.$$eval(".fbar .chip", (els) => els.map((e) => e.textContent.trim()).join("|"))) === `Tất cả (${apiArcane.counts.all})|Phim lẻ (${apiArcane.counts.movie})|Phim bộ (${apiArcane.counts.tv})`, await text(page, ".fbar"));
  await page.click('.fbar .chip:text-is("Phim lẻ (' + apiArcane.counts.movie + ')")');
  await page.waitForURL(/type=movie/);
  await page.waitForSelector(".gridwrap .card");
  check("tab Phim lẻ → only movie cards", (await page.$$eval(".gridwrap .card", (els) => els.every((e) => e.dataset.mediaKey.startsWith("movie:")))) && (await page.getAttribute('.fbar .chip.on', "href")).includes("type=movie"));
  await page.keyboard.press("/");
  await page.waitForSelector(".sov");
  check("recent searches listed after Enter (Tìm gần đây + arcane)", /Tìm gần đây/.test(await text(page, ".sov .dd")) && /arcane/.test(await text(page, ".sov .dd")));
  await s.shot("search-recent");
  await page.keyboard.press("Escape");
  check("Esc closes overlay", (await page.$(".sov")) === null);
  await page.keyboard.press("/");
  await page.fill(".sov input", "dune");
  await page.keyboard.press("Enter");
  await page.waitForURL(/q=dune/);
  await page.keyboard.press("/");
  await page.waitForSelector(".sov .dd .r");
  check("recent: newest first, max entries", (await page.$$eval(".sov .dd .r", (els) => els.map((e) => e.textContent.replace(/[🕘✕]/g, "").trim()).join(","))) === "dune,arcane");
  await page.click(".sov .dd .r >> nth=0 >> .rm");
  check("✕ removes one recent entry", (await page.$$eval(".sov .dd .r", (els) => els.map((e) => e.textContent.replace(/[🕘✕]/g, "").trim()).join(","))) === "arcane");
  await page.click(".sov .dd .r >> nth=0");
  await page.waitForURL(/q=arcane/);
  check("clicking a recent entry searches it", page.url().includes("q=arcane"));
  await page.keyboard.press("/");
  await page.waitForSelector(".sov .more");
  await page.click(".sov .more");
  check("Xoá lịch sử tìm kiếm clears + localStorage empty", (await page.$(".sov .dd")) === null && (await page.evaluate(() => localStorage.getItem("lumen.recentSearches"))) === "[]");
  await page.route("**/api/catalog/search*", async (r) => { await sleep(1500); await r.continue().catch(() => {}); });
  await page.fill(".sov input", "interst");
  await sleep(700);
  check("loading glyph ⟳ while the search request is pending", /⟳/.test(await text(page, ".sov .inp")));
  await page.unroute("**/api/catalog/search*");
  await page.waitForSelector('.sov[data-status="done"]');
  await page.fill(".sov input", "phim gi do");
  await page.waitForSelector('.sov[data-status="done"]', { timeout: 15000 });
  check("empty overlay copy", (await text(page, ".sov .dd")) === 'Không tìm thấy "phim gi do". Thử tên tiếng Anh, bỏ dấu, hoặc ít từ hơn.', await text(page, ".sov .dd"));
  await page.keyboard.press("Escape");
  await s.goto("/search?q=phim%20gi%20do");
  check("/search empty: title, 0 kết quả, hint, Đang thịnh hành row", (await text(page, ".pagehd h1")) === "Kết quả cho “phim gi do”" && (await text(page, ".pagehd p")) === "0 kết quả" && (await text(page, ".emptybox .emptytitle")) === "Không tìm thấy “phim gi do”" && (await text(page, "section .h h2")) === "Đang thịnh hành");
  await s.goto("/search?q=s");
  check("/search short query state", (await text(page, ".pagehd h1")) === "Tìm kiếm" && (await text(page, ".emptybox .emptytitle")) === "Nhập ít nhất 2 ký tự");
  await s.goto("/search");
  // the page's own input (.msearch) is a ≤ 700 px affordance: present in the DOM, hidden on desktop where the header 🔍 / `/` serve
  check("/search with no q → same short-query state; mobile-only input hidden on desktop", (await text(page, ".emptybox .emptytitle")) === "Nhập ít nhất 2 ký tự" && (await css(page, "main .msearch", "display")) === "none");

  reportConsole(s.log, "desktop home/search");
  await s.close();
  report.finish();
}

main().catch((err) => { console.error(err); process.exit(1); });
