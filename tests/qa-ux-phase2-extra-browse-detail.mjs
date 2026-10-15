// Independent Phase 2 UX walkthrough, desktop 1440×900 — browse filters/menus/URL/back/infinite scroll/end/error retry/empty,
// header solid, movie detail (cast thêm, genre link, collection, similar, trailer, ＋/👍), series (season keyboard, ?s=, overview
// expand, future rows + dropdown meta on an airing series, season skeleton), notifications (badge, row click, mark read), 404s.
//   node tests/qa-ux-phase2-extra-browse-detail.mjs [--base http://localhost:3000]
import { findAiringSeriesWithFutureEpisodes } from "./qa-phase2-extra-helpers.mjs";
import { check, count, css, launch, report, reportConsole, sleep, text } from "./qa-ux-phase2-extra-setup.mjs";

async function main() {
  const s = await launch();
  const { page } = s;
  await s.seed("clear-user-media");
  const cnt = async () => Number((await text(page, ".fbar .cnt")).replace(/\D/g, ""));
  const waitReady = () => page.waitForSelector('.gridwrap[data-status="ready"]', { timeout: 20000 });

  // ---------------------------------------------------------------- browse: header, chips, menus, URL sync, back
  await s.goto("/movies");
  await waitReady();
  check("browse header + subtitle", (await text(page, ".pagehd h1")) === "Phim lẻ" && (await text(page, ".pagehd p")) === "Lọc theo năm, thể loại, chất lượng. Phim đã cache phát ngay.");
  check("chips default labels", (await page.$$eval(".fbar .chip.desk", (els) => els.map((e) => e.textContent.trim()).join("|"))) === "Năm: 3 năm qua ▾|Thể loại ▾|Sắp xếp: Thịnh hành ▾|Chất lượng: Tất cả ▾");
  check("toggle + count", /^Chỉ phim đã cache/.test(await text(page, ".fbar .tog")) && /^\d+ phim$/.test(await text(page, ".fbar .cnt")));
  const c0 = await cnt();
  await page.click('[data-filter="year"]');
  await page.waitForSelector(".menu2");
  check("year menu: 6 rows, ✓ on 3 năm qua, chip .sel", (await count(page, ".menu2 > div")) === 6 && (await text(page, ".menu2 div.on")) === "✓ 3 năm qua" && /sel/.test(await page.getAttribute('[data-filter="year"]', "class")));
  await s.shot("browse-year-open");
  await page.click('.menu2 div:text-is("2010s")');
  await page.waitForURL(/\/movies\?year=2010s$/);
  await waitReady();
  check("year → URL + chip + count changes", (await text(page, '[data-filter="year"]')) === "Năm: 2010s ▾" && (await cnt()) !== c0, `${c0} → ${await cnt()}`);
  await page.click('[data-filter="genre"]');
  await page.waitForSelector(".menu2");
  check("genre menu: hint, ☐ rows, Áp dụng", /Chọn nhiều thể loại/.test(await text(page, ".menu2")) && (await count(page, '.menu2 div:has-text("☐")')) >= 10 && (await page.$('.menu2 div:text-is("Áp dụng")')) !== null);
  const g1 = await text(page, '.menu2 div:has-text("☐") >> nth=0');
  const g2 = await text(page, '.menu2 div:has-text("☐") >> nth=1');
  await page.click('.menu2 div:has-text("☐") >> nth=0');
  await page.click('.menu2 div:has-text("☐") >> nth=0');
  check("two genres ticked ☑ before apply", (await count(page, '.menu2 div:has-text("☑")')) === 2 && !page.url().includes("genre="));
  await s.shot("browse-genre-open");
  const applyGeo = await page.$eval('.menu2 div:text-is("Áp dụng")', (el) => ({ bottom: Math.round(el.getBoundingClientRect().bottom), vh: innerHeight }));
  check("genre menu 'Áp dụng' is inside the 1440×900 viewport (menu fits / scrolls)", applyGeo.bottom <= applyGeo.vh, `apply bottom ${applyGeo.bottom} px vs viewport ${applyGeo.vh} px`);
  if (applyGeo.bottom <= applyGeo.vh) await page.click('.menu2 div:text-is("Áp dụng")');
  else await page.$eval('.menu2 div:text-is("Áp dụng")', (el) => el.click()); // unreachable by a real pointer → programmatic click to continue
  await page.waitForURL(/genre=\d+(?:,|%2C)\d+/);
  await waitReady();
  const n1 = g1.replace("☐ ", ""), n2 = g2.replace("☐ ", "");
  check("Áp dụng → URL genre=a,b + chip 'Thể loại: A, B ▾'", (await text(page, '[data-filter="genre"]')) === `Thể loại: ${n1}, ${n2} ▾`, await text(page, '[data-filter="genre"]'));
  await page.click('[data-filter="sort"]');
  await page.click('.menu2 div:text-is("Đánh giá cao")');
  await page.waitForURL(/sort=top/);
  await page.click('[data-filter="quality"]');
  await page.click('.menu2 div:text-is("Có 4K")');
  await page.waitForURL(/q4k=1/);
  await page.click(".fbar .tog");
  await page.waitForURL(/cached=1/);
  await waitReady();
  check("sort/q4k/cached all in URL in contract order", /\/movies\?year=2010s&genre=\d+(?:,|%2C)\d+&sort=top&q4k=1&cached=1$/.test(page.url()), page.url());
  check("toggle i.on + chip labels", (await page.$(".fbar .tog i.on")) !== null && (await text(page, '[data-filter="sort"]')) === "Sắp xếp: Đánh giá cao ▾" && (await text(page, '[data-filter="quality"]')) === "Chất lượng: Có 4K ▾");
  await page.goBack(); await page.goBack(); await page.goBack();
  await page.waitForURL(/genre=\d+(?:,|%2C)\d+$/);
  await waitReady();
  check("back ×3 → genre URL + chips restored", (await text(page, '[data-filter="sort"]')) === "Sắp xếp: Thịnh hành ▾" && (await page.$(".fbar .tog i.on")) === null && (await text(page, '[data-filter="genre"]')) === `Thể loại: ${n1}, ${n2} ▾`);
  await page.goForward();
  await page.waitForURL(/sort=top/);
  check("forward restores sort", (await text(page, '[data-filter="sort"]')) === "Sắp xếp: Đánh giá cao ▾");

  // ---------------------------------------------------------------- infinite scroll skeleton, end message, error retry, empty
  // hold every page ≥ 2 (warm cache answers in ~30 ms; the sentinel's 600px margin can pull page 3 right after page 2) so the skeleton is observable
  const holdNext = async (r) => { if (/[?&]page=1\b/.test(r.request().url())) return r.continue().catch(() => {}); await sleep(1500); await r.continue().catch(() => {}); };
  await page.route("**/api/catalog/discover*", holdNext);
  await s.goto("/movies");
  await waitReady();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForSelector("[data-loading-more]", { timeout: 5000 });
  const skel = await page.$$eval(".card.sk", (els) => els.length);
  check("loading-more: 7 skeleton cards under the grid", skel === 7, `${skel} .card.sk (grid has ${await count(page, ".gridwrap .grid .card:not(.sk)")} real cards)`);
  await s.shot("browse-loading-more");
  await page.waitForFunction(() => document.querySelectorAll(".gridwrap .grid .card:not(.sk)").length >= 40, null, { timeout: 15000 }).catch(() => {});
  const keys = await page.$$eval(".gridwrap .grid .card:not(.sk)", (els) => els.map((e) => e.dataset.mediaKey));
  // any whole number of pages ≥ 2, all unique (page 3 may already be in)
  check("page 2 appended → whole pages of 20, no duplicates (reviewer P2-3)", keys.length >= 40 && keys.length % 20 === 0 && new Set(keys).size === keys.length, `${keys.length} cards, ${new Set(keys).size} unique`);
  await page.unroute("**/api/catalog/discover*", holdNext);
  await s.goto("/movies?year=2020s&genre=37");
  await waitReady();
  for (let i = 0; i < 12 && !(await page.$(".endmsg")); i++) { await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await sleep(700); }
  // TMDB's total_results counts items its pages repeat / omit (overlap between pages); the deduped grid may end a few cards short of N
  const endCards = await count(page, ".gridwrap .card"), endN = await cnt();
  check("end: 'Đã hết kết quả · N phim' with N = count (grid within 10 % of N — TMDB page overlap)", (await text(page, ".endmsg")) === `Đã hết kết quả · ${endN} phim` && endCards <= endN && endCards >= Math.floor(endN * 0.9), `${await text(page, ".endmsg")} cards ${endCards}`);
  await s.shot("browse-end");
  await s.scenario(["tmdb-down"]);
  await s.goto("/movies");
  await page.waitForSelector(".gridwrap .errbox");
  check("tmdb-down: errbox copy + Thử lại, count '… phim'", (await text(page, ".errbox .errmsg")) === "Không tải được danh sách phim. Kiểm tra mạng rồi thử lại." && (await text(page, ".errbox button")) === "Thử lại" && (await text(page, ".fbar .cnt")) === "… phim");
  await s.scenario([]);
  await page.evaluate(() => { document.cookie = "lumen_scenario=; Max-Age=0; path=/"; });
  await page.click(".errbox button");
  await waitReady();
  const recovered = await count(page, ".gridwrap .card:not(.sk)"); // page 2 may follow immediately (sentinel in view, warm cache)
  check("Thử lại after recovery → grid loads, errbox gone", recovered >= 20 && recovered % 20 === 0 && (await page.$(".gridwrap .errbox")) === null, `${recovered} cards, errbox=${(await page.$(".gridwrap .errbox")) !== null}, cnt='${await text(page, ".fbar .cnt")}'`);
  await s.goto("/movies?genre=16,37,10752,27");
  await waitReady();
  check("empty: title/hint/Xoá lọc", (await text(page, ".emptybox .emptytitle")) === "Không có phim nào khớp bộ lọc" && (await text(page, ".emptybox .emptyhint")) === "Thử bỏ bớt thể loại hoặc tắt “Chỉ phim đã cache”." && (await text(page, ".fbar .cnt")) === "0 phim");
  await page.click('.emptybox button:text-is("Xoá lọc")');
  await page.waitForURL(/\/movies$/);
  check("Xoá lọc → /movies", page.url().endsWith("/movies"));
  await page.evaluate(() => window.scrollTo(0, 60));
  await sleep(200);
  check("header .solid after 40 px scroll", /solid/.test(await page.getAttribute("header", "class")));
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(200);
  check("header not solid at top", !/solid/.test(await page.getAttribute("header", "class")));
  await s.goto("/series");
  await waitReady();
  check("/series page + tv cards", (await text(page, ".pagehd h1")) === "Phim bộ" && (await page.$$eval(".gridwrap .card", (els) => els.every((e) => e.dataset.mediaKey.startsWith("tv:")))));

  // ---------------------------------------------------------------- movie detail
  await s.goto("/movie/634649");
  // Phase 3 prepends the cache fact ("Đã cache · Phát trực tiếp" / "Chưa cache · 2–10 phút để tải" / "Đang kiểm tra Torbox…")
  check("facts: [cache fact] 2021 · 2h 28m · HD · age · ★ r IMDb", /^(?:.+? )?2021 2h 28m HD (\d{2}\+|P) ★ \d\.\d IMDb$/.test((await page.$$eval(".facts span", (els) => els.map((e) => e.textContent.trim()).join(" ")))), await page.$$eval(".facts span", (els) => els.map((e) => e.textContent.trim()).join(" ")));
  const kvCast = ".kv >> nth=0";
  const names = async () => (await text(page, kvCast)).replace(/^Diễn viên:\s*/, "").replace(/,\s*thêm$/, "").split(", ").filter(Boolean);
  check("cast: 3 names + thêm", (await names()).length === 3 && (await page.$(`${kvCast} >> i`)) !== null, await text(page, kvCast));
  await page.click(`${kvCast} >> i`);
  check("thêm → 10 names, no more 'thêm'", (await names()).length === 10 && (await page.$(`${kvCast} >> i`)) === null, String((await names()).length));
  await s.shot("detail-cast-expanded");
  check("Đạo diễn / Thể loại links / Tên gốc", /Đạo diễn:/.test(await text(page, ".kv >> nth=1")) && (await count(page, '.kv a[href^="/movies?genre="]')) >= 3 && /Tên gốc:\s*Spider-Man: No Way Home/.test(await text(page, ".kv >> nth=3")));
  check("rows: Bộ sưu tập … + Phim tương tự", /^Bộ sưu tập /.test(await text(page, "section .h h2 >> nth=0")) && (await text(page, "section .h h2 >> nth=1")) === "Phim tương tự" && (await count(page, "section >> nth=0 >> .card")) >= 3);
  // Phase 3 fills the primary slot ("▶ Phát · 1080p" / "⬇ Tải lên cloud · …" / "⟳ Đang tìm nguồn…" …) — only the order matters here
  check("action row order: [primary] ＋ 👍 Chọn bản khác 📺 Xem bằng app ▶ Trailer", /^[^|]+\|＋\|👍\|Chọn bản khác\|📺 Xem bằng app\|▶ Trailer$/.test(await page.$$eval(".detail .acts > *", (els) => els.map((e) => e.textContent.trim()).join("|"))));
  check("primary slot is a real button (Phase 3)", (await page.$("[data-primary]")) !== null && (await css(page, "[data-primary]", "visibility")) === "visible");
  await page.click('[data-action="trailer"]');
  await page.waitForSelector(".dlg .yt iframe");
  check("trailer: youtube-nocookie iframe + Đóng", /youtube-nocookie\.com\/embed\//.test(await page.getAttribute(".dlg .yt iframe", "src")) && (await text(page, '.dlg button')) === "Đóng");
  await s.shot("detail-trailer");
  await page.click('.dlg button:text-is("Đóng")');
  check("Đóng closes trailer", (await page.$(".dlg")) === null);
  await page.click('.btn.round[title="Danh sách của tôi"]');
  await sleep(500);
  check("detail ＋ → ✓ + toast", (await text(page, '.btn.round[title="Danh sách của tôi"]')) === "✓" && /Đã thêm "Người Nhện: Không Còn Nhà" vào danh sách/.test(await text(page, ".toasts .toast")));
  await page.click('.btn.round[title="Danh sách của tôi"]');
  await sleep(400);
  check("detail ✓ → ＋", (await text(page, '.btn.round[title="Danh sách của tôi"]')) === "＋");
  await page.click('.btn.round[title="Thích"]');
  await sleep(400);
  check("detail 👍 → white + data-liked", /\bw\b/.test(await page.getAttribute('.btn.round[title="Thích"]', "class")) && (await page.getAttribute('.btn.round[title="Thích"]', "data-liked")) === "true");
  await page.click('.btn.round[title="Thích"]');
  await page.click('.kv a[href^="/movies?genre="] >> nth=0');
  await page.waitForURL(/\/movies\?genre=\d+$/);
  await waitReady();
  check("genre link → /movies?genre=<id> with chip label", /^Thể loại: .+ ▾$/.test(await text(page, '[data-filter="genre"]')), page.url());
  await s.goto("/movie/40444");
  check("EN overview fallback (40444): EN pill with tooltip + text", (await page.$('.detail p .pill[title="Chưa có mô tả tiếng Việt"]')) !== null && (await text(page, ".detail p")).length > 60);

  // ---------------------------------------------------------------- series
  await s.goto("/series/66732?s=4");
  check("series facts: [cache fact] 2016–YYYY · N mùa · HD · age · ★ IMDb", /^(?:.+? )?2016–\d{4} \d mùa HD (\d{2}\+|P) ★ \d\.\d IMDb$/.test(await page.$$eval(".facts span", (els) => els.map((e) => e.textContent.trim()).join(" "))), await page.$$eval(".facts span", (els) => els.map((e) => e.textContent.trim()).join(" ")));
  check("series action order: 📺 Xem bằng app before Chọn bản khác", /＋\|👍\|📺 Xem bằng app\|Chọn bản khác/.test(await page.$$eval(".detail .acts > *", (els) => els.map((e) => e.textContent.trim()).join("|"))));
  check("kv Đang xem: —", /Đang xem:\s*—/.test(await page.$$eval(".kv", (els) => els.map((e) => e.textContent).join(" "))));
  check("hero 520px (series)", (await page.$eval(".detail.series", (el) => el.offsetHeight)) === 520);
  check("S4: 'Mùa 4 ▾', rows with 'Ng Np' runtime, Phim bộ tương tự", (await text(page, ".eps .dd")) === "Mùa 4 ▾" && (await count(page, ".eps .ep")) === 9 && /^\d+g \d+p$/.test(await text(page, ".eps .ep .n span")) && (await page.$('section .h h2:text-is("Phim bộ tương tự")')) !== null);
  const p0 = ".eps .ep >> nth=0 >> .p";
  check("episode overview clamped (2 lines) by default", /clamp/.test(await page.getAttribute(p0, "class")) && (await css(page, p0, "-webkit-line-clamp")) === "2");
  await page.click(p0);
  check("click expands overview", !/clamp/.test(await page.getAttribute(p0, "class")));
  await page.click(p0);
  check("click again collapses", /clamp/.test(await page.getAttribute(p0, "class")));
  await page.focus(".eps .dd");
  await page.keyboard.press("Enter");
  await page.waitForSelector(".menu2.seasonmenu");
  const items = await page.$$eval(".menu2.seasonmenu [role=menuitem]", (els) => els.map((e) => e.textContent.trim()));
  check("season menu: 5 seasons, ✓ Mùa 4, meta 'n tập · đã xem 0/n' or 'chưa phát sóng'", items.length === 5 && /^✓ Mùa 4/.test(items[3]) && items.every((t) => /\d+ tập · (đã xem 0\/\d+|\d+ tập chưa phát sóng)$/.test(t)), items.join(" | "));
  await s.shot("series-season-menu");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.waitForURL(/\?s=\d+$/);
  await page.waitForSelector('.eps[data-status="ready"]');
  const picked = page.url().match(/s=(\d+)$/)[1];
  check("keyboard ArrowDown+Enter switches season + URL ?s= + label", picked !== "4" && (await text(page, ".eps .dd")) === `Mùa ${picked} ▾` && (await page.getAttribute(".eps", "data-season")) === picked, `s=${picked}`);
  await page.route("**/api/catalog/series/*/season/*", async (r) => { await sleep(1500); await r.continue().catch(() => {}); });
  await page.click(".eps .dd");
  await page.click('.menu2.seasonmenu [data-season="3"]');
  await page.waitForSelector('.eps[data-status="loading"]');
  check("season switch shows 4-row skeleton", (await count(page, '.eps[data-status="loading"] .ep')) === 4);
  await s.shot("series-season-loading");
  await page.unroute("**/api/catalog/series/*/season/*");
  await page.waitForSelector('.eps[data-status="ready"]');
  check("season 3 loaded + URL", (await count(page, ".eps .ep")) === 8 && page.url().endsWith("?s=3"));
  await page.reload({ waitUntil: "networkidle" });
  check("reload keeps ?s=3 (SSR)", (await text(page, ".eps .dd")) === "Mùa 3 ▾");
  const airing = await findAiringSeriesWithFutureEpisodes();
  if (!airing) check("airing series found", false);
  else {
    await s.goto(`/series/${airing.id}?s=${airing.season}`);
    check(`airing ${airing.name}: ${airing.unaired} .ep.future rows, dimmed, 'Phát sóng dd/mm'`, (await count(page, ".ep.future")) === airing.unaired && (await css(page, ".ep.future", "opacity")) === "0.5" && /^Phát sóng \d{2}\/\d{2}$/.test(await text(page, ".ep.future .tag.x")), `${await count(page, ".ep.future")} rows, opacity ${await css(page, ".ep.future", "opacity")}`);
    await page.click(".eps .dd");
    await page.waitForSelector(".menu2.seasonmenu");
    const cur = await text(page, ".menu2.seasonmenu [role=menuitem].on");
    check("dropdown meta for the airing season: 'N tập · M tập chưa phát sóng'", cur.endsWith(`${airing.total} tập · ${airing.unaired} tập chưa phát sóng`), cur);
    await page.$eval(".ep.future", (el) => el.scrollIntoView({ block: "center" }));
    await page.keyboard.press("Escape");
    await s.shot("series-future-episode");
  }

  // ---------------------------------------------------------------- notifications
  await s.seed("notifications");
  await s.goto("/");
  check("badge-dot shows 2 after seed", (await text(page, ".badge-dot")) === "2");
  await page.click(".bell-wrap");
  await page.waitForSelector(".notif .it.unread"); // `.it` alone also matches the transient "…" loading row
  check("dropdown: 4 rows, 2 unread first, <b> markers, mark-read button", (await count(page, ".notif .it")) === 4 && (await count(page, ".notif .it.unread")) === 2 && (await count(page, ".notif .it b")) === 4 && (await text(page, ".notif .hd button")) === "Đánh dấu đã đọc", `${await count(page, ".notif .it")} rows, ${await count(page, ".notif .it.unread")} unread, ${await count(page, ".notif .it b")} <b>, btn='${await text(page, ".notif .hd button").catch(() => "")}'`);
  await s.shot("notifications-open");
  const first = await s.api("/api/notifications");
  const target = first.items.find((i) => !i.read);
  await page.click(".notif .it.unread >> nth=0");
  await page.waitForURL((u) => u.pathname + u.search === target.href);
  await page.waitForLoadState("networkidle");
  check("unread row click → its href + badge 1", (await text(page, ".badge-dot")) === "1", page.url());
  await page.click(".bell-wrap");
  await page.waitForSelector(".notif .hd button");
  await page.click(".notif .hd button");
  await page.waitForFunction(() => !document.querySelector(".badge-dot") && !document.querySelector(".notif .it.unread"), null, { timeout: 5000 }).catch(() => {}); // PATCH round-trip
  check("Đánh dấu đã đọc → badge gone, no unread rows, button hidden", (await page.$(".badge-dot")) === null && (await count(page, ".notif .it.unread")) === 0 && (await page.$(".notif .hd button")) === null, `badge=${(await page.$(".badge-dot")) !== null} unread=${await count(page, ".notif .it.unread")} btn=${(await page.$(".notif .hd button")) !== null}`);
  await page.keyboard.press("Escape");
  check("Esc closes notifications", (await page.$(".notif")) === null);
  await s.seed("clear-notifications");
  await s.goto("/");
  await page.click(".bell-wrap");
  await page.waitForFunction(() => /Chưa có thông báo|vừa|đã/.test(document.querySelector(".notif")?.textContent ?? ""), null, { timeout: 5000 }).catch(() => {});
  check("empty notifications copy", (await text(page, ".notif .it")) === "Chưa có thông báo", await text(page, ".notif .it"));
  await page.keyboard.press("Escape");

  // ---------------------------------------------------------------- 404 routes (status + content)
  const st404 = await s.goto("/khong-ton-tai");
  check("/khong-ton-tai → emptybox", (await page.$(".emptybox")) !== null, `status ${st404}`);
  const stMovie = await s.goto("/movie/999999999");
  check("/movie/999999999 → 'Không tìm thấy phim' + HTTP 404", (await text(page, ".emptybox .emptytitle")) === "Không tìm thấy phim" && stMovie === 404, `status ${stMovie}`);
  await s.goto("/search?q=s");

  // tmdb-down is exercised above: the app logs handled failures with console.warn by design (client paged-fetch, server genre warn forwarded by next dev); YouTube's iframe notice is third-party
  reportConsole(s.log, "desktop browse/detail/series/notif/404", /\[paged-fetch\]|\[browse\] genres failed|allowfullscreen/);
  await s.close();
  report.finish();
}

main().catch((err) => { console.error(err); process.exit(1); });
