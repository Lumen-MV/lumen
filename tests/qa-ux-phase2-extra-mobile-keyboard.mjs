// Independent Phase 2 UX checks the other extra scripts do not cover: hover panel ＋/👍 reflecting server state (reviewer P1-2),
// keyboard-only filter menus (reviewer P1-5: Tab/Enter/Space/Arrows), hover panel focus handling (P2-4), TV genre language in
// hover/kv/filter menu, hero dots/arrows focusability, and the 390×844 mobile pass (tab-bar "Tìm kiếm", filter sheet, tap → detail).
//   node tests/qa-ux-phase2-extra-mobile-keyboard.mjs [--base http://localhost:3000]
import { check, count, css, launch, note, report, reportConsole, sleep, text } from "./qa-ux-phase2-extra-setup.mjs";

const EN_GENRE = /^[A-Za-z &\-]+$/;
const activeInfo = (page) => page.evaluate(() => { const a = document.activeElement; return a ? `${a.tagName.toLowerCase()}${a.className ? "." + String(a.className).trim().replace(/\s+/g, ".") : ""}${a.getAttribute("role") ? "[role=" + a.getAttribute("role") + "]" : ""}:${(a.textContent ?? "").trim().slice(0, 30)}` : "none"; });

async function desktop() {
  const s = await launch();
  const { page } = s;
  await s.seed("clear-user-media");

  // ---------------------------------------------------------------- hover panel must reflect already-saved / liked state (P1-2)
  await s.goto("/");
  const rowSel = 'section:has(h2:text-is("Dành riêng cho bạn"))';
  const key = await page.getAttribute(`${rowSel} .card >> nth=1`, "data-media-key");
  const title = await text(page, `${rowSel} .card >> nth=1 >> .n`);
  const saveRes = await (await s.ctx.request.post("http://localhost:3000/api/my-list", { data: { mediaKey: key } })).json();
  const likeRes = await (await s.ctx.request.post("http://localhost:3000/api/likes", { data: { mediaKey: key } })).json();
  check(`API: saved + liked ${key} '${title}'`, saveRes.saved === true && likeRes.liked === true);
  await s.goto("/");
  await page.hover(`${rowSel} .card >> nth=1`);
  await page.waitForSelector(".card.hov .hoverpanel", { timeout: 5000 });
  const acts = ".card.hov .hoverpanel .acts span";
  const plus = await text(page, `${acts} >> nth=1`);
  const likeCls = (await page.getAttribute(`${acts} >> nth=2`, "class")) ?? "";
  check("P1-2: hover ＋ shows ✓ for an already-saved title", plus === "✓", `shows '${plus}'`);
  check("P1-2: hover 👍 is white (class w) for an already-liked title", /\bw\b/.test(likeCls), `class='${likeCls}'`);
  await s.shot("hover-already-saved");
  await page.click(`${acts} >> nth=1`);
  await sleep(600);
  const toast = (await page.$(".toasts .toast")) ? await text(page, ".toasts .toast") : "";
  note(`P1-2: clicking the hover button on the already-saved title → toast '${toast}' (expected: removal, no 'Đã thêm' toast)`);
  check("P1-2: click on already-saved title must not show the 'Đã thêm' toast", !/Đã thêm/.test(toast), toast);
  await page.mouse.move(5, 850);
  await sleep(200);

  // ---------------------------------------------------------------- hover panel + keyboard focus (P2-4) and TV genres language
  await s.goto("/");
  const tvRow = 'section:has(h2:text-is("Phim bộ thịnh hành"))';
  await page.focus(`${tvRow} .card >> nth=0 >> a`);
  await sleep(600);
  check("focusing a poster link opens the hover panel (onFocus)", (await page.$(`${tvRow} .card.hov .hoverpanel`)) !== null);
  await page.keyboard.press("Tab");
  await sleep(150);
  check("P2-4: Tab from poster link into the panel keeps the panel open", (await page.$(`${tvRow} .card.hov .hoverpanel`)) !== null, `active=${await activeInfo(page)}`);
  await page.mouse.move(5, 850);
  await page.keyboard.press("Escape");
  const tvGenres = [];
  for (let i = 0; i < 6; i++) {
    await page.hover(`${tvRow} .card >> nth=${i}`);
    await page.waitForSelector(`${tvRow} .card.hov .hoverpanel`, { timeout: 5000 }).catch(() => {});
    for (let t = 0; t < 20 && /…/.test(await text(page, `${tvRow} .card.hov .hoverpanel .m >> nth=0`).catch(() => "…")); t++) await sleep(150);
    const g = await text(page, `${tvRow} .card.hov .hoverpanel .m >> nth=1`).catch(() => "");
    tvGenres.push(g);
    await page.mouse.move(5, 850);
    await sleep(120);
  }
  const english = tvGenres.flatMap((g) => g.split(" · ")).filter((g) => EN_GENRE.test(g));
  check("hover panel TV genres are Vietnamese (no 'Action & Adventure' / 'Sci-Fi & Fantasy')", english.length === 0, `${tvGenres.join(" | ")} → English: ${[...new Set(english)].join(", ")}`);
  await s.goto("/series");
  await page.waitForSelector('.gridwrap[data-status="ready"]');
  await page.click('[data-filter="genre"]');
  await page.waitForSelector(".menu2");
  const menuGenres = await page.$$eval(".menu2 [role=menuitemcheckbox]", (els) => els.map((e) => e.textContent.replace(/^[☐☑]\s*/, "").trim()));
  check("/series genre menu lists ≥ 10 genres as checkbox items", menuGenres.length >= 10, String(menuGenres.length));
  const menuEnglish = menuGenres.filter((g) => EN_GENRE.test(g));
  check("/series genre menu: all genre names Vietnamese", menuEnglish.length === 0, `English: ${menuEnglish.join(", ")} (of ${menuGenres.length})`);
  await s.shot("series-genre-menu");
  await page.keyboard.press("Escape");

  // ---------------------------------------------------------------- keyboard-only filter menus (P1-5)
  await s.goto("/movies");
  await page.waitForSelector('.gridwrap[data-status="ready"]');
  await page.focus('[data-filter="year"]');
  check("year chip is focusable", (await activeInfo(page)).includes("chip"), await activeInfo(page));
  await page.keyboard.press("Enter");
  await page.waitForSelector(".menu2", { timeout: 3000 }).catch(() => {});
  const enterOpens = (await page.$(".menu2")) !== null;
  check("P1-5: Enter on the focused year chip opens the menu", enterOpens, `active=${await activeInfo(page)}`);
  if (!enterOpens) { await page.click('[data-filter="year"]'); await page.waitForSelector(".menu2"); note("P1-5: menu opened with the mouse to continue the keyboard checks"); }
  const afterOpen = await activeInfo(page);
  check("P1-5: after Enter, focus is inside the menu (not left on the chip)", /menuitem/.test(afterOpen), `active=${afterOpen}`);
  await page.keyboard.press("ArrowDown");
  await sleep(150); // Radix roving focus moves in a setTimeout
  const afterArrow = await activeInfo(page);
  check("P1-5: ArrowDown moves focus between menu items", /menuitem/.test(afterArrow) && afterArrow !== afterOpen, `active=${afterArrow}`);
  await page.keyboard.press("Tab");
  await sleep(150);
  const afterTab = await activeInfo(page);
  check("P1-5: Tab from an open menu reaches a menu item (not the next chip)", /menuitem/.test(afterTab), `active=${afterTab}`);
  await page.keyboard.press("Escape");
  await sleep(150);
  check("Esc closes the menu", (await page.$(".menu2")) === null);
  await page.focus('[data-filter="year"]');
  await page.keyboard.press("Space");
  await sleep(200);
  const spaceOpens = (await page.$(".menu2")) !== null;
  check("P1-5: Space on a chip opens the menu (role=button contract)", spaceOpens);
  if (!spaceOpens) { await page.click('[data-filter="year"]'); await page.waitForSelector(".menu2"); }
  await page.focus('.menu2 [role=menuitem] >> nth=4'); // "2010s"
  await page.keyboard.press("Space");
  await sleep(300);
  check("P1-5: Space on a menu item selects it", /year=2010s/.test(page.url()), page.url());
  if (!/year=2010s/.test(page.url())) { await page.keyboard.press("Enter"); await page.waitForURL(/year=2010s/).catch(() => {}); }
  check("Enter on a menu item selects it (URL year=2010s)", /year=2010s/.test(page.url()));
  await page.focus(".fbar .tog");
  await page.keyboard.press("Space");
  await sleep(300);
  check("P2-5: Space toggles 'Chỉ phim đã cache' switch", /cached=1/.test(page.url()), page.url());
  // hero controls focusability
  await s.goto("/");
  const dotsTab = await page.$$eval(".hero .dots i, .hero .hero-arrow, .chev", (els) => els.map((e) => `${e.className}:${e.tabIndex}`));
  check("P2-5: hero dots focusable (tabIndex ≥ 0)", (await page.$$eval(".hero .dots i", (els) => els.every((e) => e.tabIndex >= 0))), dotsTab.slice(0, 6).join(","));
  await page.hover('section:has(h2:text-is("Phim bộ thịnh hành")) .row');
  check("P2-5: row chevrons focusable", await page.$$eval(".chev", (els) => els.length > 0 && els.every((e) => e.tabIndex >= 0)), await page.$$eval(".chev", (els) => els.map((e) => e.tabIndex).join(",")));

  reportConsole(s.log, "desktop keyboard/hover-state");
  await s.seed("clear-user-media");
  await s.close();
}

async function mobile() {
  const s = await launch({ width: 390, height: 844 }, { isMobile: true, hasTouch: true });
  const { page } = s;
  await s.goto("/");
  check("mobile home: tab bar visible with 4 tabs", (await css(page, ".tabbar", "display")) === "flex" && (await count(page, ".tabbar > div")) === 4);
  check("mobile home: header 🔍 hidden (mockup ≤ 700 px)", (await css(page, ".hicons .ico.search", "display")) === "none");
  check("mobile home: hero + Top 10 render, no horizontal overflow", (await page.$(".hero")) !== null && (await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)), String(await page.evaluate(() => document.documentElement.scrollWidth)));
  await s.shot("mobile-home");
  // "Tìm kiếm" opens the search overlay as a full-screen sheet under the 56px header (no navigation); the tab bar hides meanwhile
  await page.tap('.tabbar > div:has-text("Tìm kiếm")');
  await page.waitForSelector(".sov input", { timeout: 5000 });
  const sheet = await page.$eval(".sov", (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, pos: getComputedStyle(el).position }; });
  check("mobile tab-bar 'Tìm kiếm' opens the full-screen search sheet (fixed, full width under the 56px header)", sheet.pos === "fixed" && sheet.x === 0 && sheet.y === 56 && sheet.w === 390 && sheet.h === 844 - 56, JSON.stringify(sheet));
  check("search sheet: input focused, tab bar hidden, still on /", (await page.evaluate(() => document.activeElement === document.querySelector(".sov input"))) && (await css(page, ".tabbar", "display")) === "none" && new URL(page.url()).pathname === "/");
  await page.evaluate(() => localStorage.setItem("lumen.recentSearches", JSON.stringify(["dune", "one piece"])));
  await page.tap(".sov .inp .x");
  await page.tap('.tabbar > div:has-text("Tìm kiếm")');
  await page.waitForSelector(".sov .sec");
  check("search sheet: recent searches listed when empty", /Tìm gần đây/.test(await text(page, ".sov .dd")) && (await count(page, ".sov .dd .r")) === 2);
  await page.fill(".sov input", "spider");
  await page.waitForSelector(".sov .dd .r img", { timeout: 15000 });
  check("search sheet: results + 'Xem tất cả kết quả'", (await count(page, ".sov .dd .r")) >= 1 && /Xem tất cả kết quả \(\d+\) ↵/.test(await text(page, ".sov .more")));
  await s.shot("mobile-search-tab");
  await page.tap(".sov .more");
  await page.waitForURL(/\/search\?q=spider/);
  await page.waitForLoadState("networkidle");
  check("/search ≤ 700 px shows its own input with the query, overlay closed, tab bar back", (await page.isVisible("main .msearch input")) && (await page.inputValue("main .msearch input")) === "spider" && (await page.$(".sov")) === null && (await css(page, ".tabbar", "display")) === "flex", page.url());
  await page.fill("main .msearch input", "arcane");
  await page.press("main .msearch input", "Enter");
  await page.waitForURL(/\/search\?q=arcane/);
  check("/search input Enter → new query", (await text(page, ".pagehd h1")) === "Kết quả cho “arcane”");
  await s.shot("mobile-search-page");
  await s.goto("/movies");
  await page.waitForSelector('.gridwrap[data-status="ready"]');
  check("mobile browse: chips collapsed to 'Lọc (0)', desktop chips hidden", (await text(page, ".fbar .chip.mob")) === "Lọc (0)" && (await css(page, '[data-filter="year"]', "display")) === "none");
  const cols = await page.$$eval(".gridwrap .grid .card", (els) => new Set(els.slice(0, 12).map((e) => Math.round(e.getBoundingClientRect().left))).size);
  note(`mobile grid: ${cols} columns (mockup comparison in qa-layout-geometry-phase2.mjs)`);
  await page.tap(".fbar .chip.mob");
  await page.waitForSelector(".sheet");
  check("sheet: title + 4 groups + Áp dụng", (await text(page, ".sheet h3")) === "Bộ lọc" && (await count(page, ".sheet .grp")) === 4 && /^Áp dụng \(\d+\)$/.test(await text(page, ".sheet .acts button, .sheet .acts .btn >> nth=-1").catch(() => "")), await text(page, ".sheet .acts"));
  await page.tap('.sheet .grp:has(b:text-is("Năm")) span:text-is("2020s")');
  await page.tap('.sheet .grp:has(b:text-is("Thể loại")) span >> nth=0');
  const applyLabel = await text(page, ".sheet .acts >> text=/Áp dụng/");
  check("sheet: Áp dụng counts selections", applyLabel === "Áp dụng (2)", applyLabel);
  await s.shot("mobile-filter-sheet");
  await page.tap(".sheet .acts >> text=/Áp dụng/");
  await page.waitForURL(/year=2020s&genre=\d+/);
  await page.waitForSelector('.gridwrap[data-status="ready"]');
  check("sheet apply → URL + 'Lọc (2)' chip", (await text(page, ".fbar .chip.mob")) === "Lọc (2)", page.url());
  await page.tap(".gridwrap .card >> nth=0");
  await page.waitForURL(/\/(movie|series)\/\d+/);
  check("mobile tap on card → detail (no hover panel)", /\/movie\/\d+/.test(page.url()) && (await page.$(".hoverpanel")) === null);
  const skelOverflow = await page.evaluate(() => document.documentElement.scrollWidth);
  await page.waitForSelector(".detail h1", { timeout: 20000 });
  note(`mobile detail: scrollWidth while the skeleton was showing = ${skelOverflow} px (viewport 390)`);
  check("mobile detail: h1 + action row wraps inside viewport", (await page.$(".detail h1")) !== null && (await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)), `scrollWidth ${await page.evaluate(() => document.documentElement.scrollWidth)}`);
  await s.shot("mobile-detail");
  await s.goto("/series/66732?s=4");
  check("mobile series: episode rows render", (await count(page, ".eps .ep")) === 9);
  reportConsole(s.log, "mobile 390");
  await s.close();
}

await desktop();
await mobile();
report.finish();
