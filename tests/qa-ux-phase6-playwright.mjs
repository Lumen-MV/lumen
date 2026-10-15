// Phase 6 UX checks (Playwright, RUNNING dev server with LUMEN_SCENARIOS=1, LUMEN_SWEEPER=0): every settings section (see
// qa-ux-phase6-settings-checks.mjs), every admin flow (dashboard, invite create → result QR, members search / filter, ⋯ menu,
// reset / lock / delete dialogs incl. typed confirm, queue actions, activity filters + CSV), keyboard reachability,
// tables at 390 px, member 403, 0 console errors. Data = `admin-data` fixture (fake TorBox jobs; no provider calls).
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, request } from "@playwright/test";
import { adminCreds, makeReporter, readEnv } from "./qa-shared-helpers.mjs";
import { goto, texts } from "./qa-ux-phase6-helpers.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const BASE = args.includes("--base") ? args[args.indexOf("--base") + 1] : "http://localhost:3000";
const ADMIN = adminCreds(readEnv(ROOT));
const report = makeReporter();
const { check } = report;
const IGNORED_CONSOLE = /status of (400|401|403|404|409|410|429)|Failed to load resource: net::ERR_FAILED/;
let seeder;
/** the settings flow's "Đăng xuất tất cả thiết bị khác" also kills the seeder's session → log in again on 401 */
async function seed(fixture) {
  let r = await seeder.post(BASE + "/api/dev/seed", { data: fixture });
  if (r.status() === 401) {
    await seeder.post(BASE + "/api/auth/login", { data: { username: ADMIN.u, password: ADMIN.p, remember: false } });
    r = await seeder.post(BASE + "/api/dev/seed", { data: fixture });
  }
  if (!r.ok()) throw new Error(`seed ${fixture.fixture} → ${r.status()}`);
  return r;
}

async function newCtx(browser, user, viewport = { width: 1440, height: 900 }, mobile = false) {
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, locale: "vi-VN", permissions: ["clipboard-read", "clipboard-write"] });
  const consoleErrors = [];
  ctx.on("page", (p) => {
    p.on("console", (m) => { if (m.type() === "error" && !IGNORED_CONSOLE.test(m.text())) consoleErrors.push(`${p.url()} :: ${m.text().slice(0, 200)}`); });
    p.on("pageerror", (e) => consoleErrors.push(`${p.url()} :: pageerror ${String(e).slice(0, 200)}`));
  });
  const r = await ctx.request.post(BASE + "/api/auth/login", { data: { username: user.u, password: user.p, remember: true } });
  if (!r.ok()) { console.error(`login failed for ${user.u}: ${r.status()}`); process.exit(2); }
  return { ctx, consoleErrors };
}
import { settingsChecks } from "./qa-ux-phase6-settings-checks.mjs";

async function adminChecks(page) {
  await goto(page, "/admin");
  check("admin: h1 + 4 tabs (Tổng quan on), 6 KPI cards with live dot, 30 bars, watching list ×3, 3 quick actions", (await page.textContent(".admin h1")) === "Quản trị" && (await texts(page, ".atabs a")).join("|") === "Tổng quan|Thành viên|Hàng đợi Torbox|Nhật ký" && (await page.textContent(".atabs a.on")) === "Tổng quan" && (await page.$$(".kpis .kpi")).length === 6 && (await page.$('[data-kpi="watching"] .live')) !== null && (await page.$$(".bars i")).length === 30 && (await page.$$("[data-watching-now] br")).length === 2 && (await texts(page, ".admin > div:last-child button")).join("|") === "＋ Tạo link mời|Xem hàng đợi|Xuất báo cáo tháng (CSV)");
  check("admin: KPI texts", /thành viên · \d+ hoạt động/.test(await page.textContent('[data-kpi="members"] span')) && /Torbox · \d+\/\d+ slot đang dùng/.test(await page.textContent('[data-kpi="torbox"] span')) && /^\d+\/20$/.test(await page.textContent('[data-kpi="os"] b')));
  await page.click(".admin > div:last-child button.btn.r");
  await page.waitForSelector(".dlg .card2 input");
  check("dashboard: '＋ Tạo link mời' opens the create dialog with expiry seg (7 ngày on) + '1 lần'", (await page.textContent(".dlg h3")) === "Tạo link mời" && (await page.textContent(".dlg .seg span.on")) === "7 ngày" && (await page.getAttribute("[data-uses]", "data-uses")) === "once");
  await page.fill(".dlg .card2 input", "Mời Đạt");
  await page.click(".dlg .seg span:nth-child(3)");
  await page.click(".dlg .acts button.btn.r");
  await page.waitForSelector(".dlg .qrbig img");
  const qrBig = await page.$eval(".qrbig", (el) => ({ w: el.getBoundingClientRect().width, img: el.querySelector("img")?.naturalWidth ?? 0 }));
  check("dashboard: create → result dialog with QR 180px, shortened link, 'Gửi link này cho Đạt. … hết hạn dd/mm/yyyy.'", qrBig.w === 180 && qrBig.img > 0 && /\/invite\/.{10}…..$/.test(await page.textContent("[data-invite-url]")) && /^Gửi link này cho Đạt\. Link dùng 1 lần, hết hạn \d\d\/\d\d\/\d{4}\.$/.test(await page.textContent(".dlg p")), JSON.stringify(qrBig) + " " + (await page.textContent("[data-invite-url]")) + " " + (await page.textContent(".dlg p")));
  await page.click(".dlg .acts button.btn.w");
  await page.waitForSelector(".dlg", { state: "detached" });
  check("result dialog: 'Sao chép link' copies the full invite URL", /\/invite\/[A-Za-z0-9_-]{32}$/.test(await page.evaluate(() => navigator.clipboard.readText()).catch(() => "")));
  await page.click(".atabs a:nth-child(3)");
  await page.waitForURL("**/admin/queue");
  check("tabs navigate (Hàng đợi Torbox on)", (await page.textContent(".atabs a.on")) === "Hàng đợi Torbox");
  // users
  await goto(page, "/admin/users");
  await page.waitForSelector("table[data-members] tr[data-member]");
  const chips = await texts(page, "table[data-invites] .st");
  check("users: invites table (5 cols + actions) with Chưa dùng / Đã dùng · Bảo / Hết hạn chips and Sao chép / Huỷ / Tạo lại buttons", (await texts(page, "table[data-invites] th")).slice(0, 5).join("|") === "Ghi chú|Link|Tạo bởi|Hết hạn|Trạng thái" && ["Chưa dùng", "Đã dùng · Bảo", "Hết hạn"].every((t) => chips.includes(t)) && (await page.$$eval('tr[data-invite="valid"]', (rows) => [...rows[0].querySelectorAll("button")].map((b) => b.textContent.trim()).join("|"))) === "Sao chép|Huỷ" && (await texts(page, 'tr[data-invite="expired"] button')).join("|") === "Tạo lại");
  check("users: members table per the revised mock (name+username cell, 7 headers, ⋯ per row, Mở khoá / Gửi lại link extras, live dot)", (await texts(page, "table[data-members] th")).slice(0, 7).join("|") === "Thành viên|Vai trò|Hoạt động gần nhất|Lượt xem/tháng ▾|Chất lượng|Thiết bị|Trạng thái" && (await page.$$("table[data-members] tr[data-member] .btn.more")).length === 7 && (await texts(page, 'tr[data-member="khang"] td.acts button')).join("|") === "Mở khoá|⋯" && (await texts(page, 'tr[data-member="dat"] td.acts button')).join("|") === "Gửi lại link|⋯" && (await page.$('tr[data-member="bao"] .live')) !== null && (await page.$eval("table[data-members] td", (td) => getComputedStyle(td).whiteSpace)) === "nowrap");
  await page.fill(".toolbar input", "tu");
  await page.waitForFunction(() => document.querySelectorAll("table[data-members] tr[data-member]").length === 1);
  check("users: search narrows to Quang", (await page.getAttribute("table[data-members] tr[data-member]", "data-member")) === "quang");
  await page.fill(".toolbar input", "");
  await page.click('.toolbar .chip:has-text("Đã khoá")');
  await page.waitForFunction(() => { const rows = document.querySelectorAll("table[data-members] tr[data-member]"); return rows.length === 1 && rows[0].dataset.member === "khang"; });
  check("users: 'Đã khoá' chip filters to Khang", (await page.getAttribute("table[data-members] tr[data-member]", "data-member")) === "khang" && (await page.textContent(".toolbar .chip.on")) === "Đã khoá");
  await page.click('.toolbar .chip:has-text("Tất cả")');
  await page.waitForFunction(() => document.querySelectorAll("table[data-members] tr[data-member]").length === 7);
  await page.click('[data-more="quang"]');
  await page.waitForSelector(".menu2 [role='menuitem']");
  check("⋯ menu items in mock order with a separator and a red delete", (await texts(page, ".menu2 [role='menuitem']")).join("|") === "Đặt lại mật khẩu|Đổi vai trò → Quản trị|Xem lịch sử xem|Thu hồi link Stremio|Khoá tài khoản|Xoá thành viên" && (await page.$(".menu2 .sep")) !== null && (await page.$eval(".menu2 [role='menuitem']:last-child", (el) => getComputedStyle(el).color)) === "rgb(240, 160, 160)");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.waitForSelector("[data-temp-password]");
  check("keyboard: ↓ Enter → 'Đặt lại mật khẩu' → temp code dialog (20px, letter-spacing 2px) + 'Sao chép và đóng'", /^[A-Za-z2-9]{3}-[A-Za-z2-9]{4}-[A-Za-z2-9]{3}$/.test(await page.textContent("[data-temp-password]")) && (await page.textContent(".dlg h3")) === "Mật khẩu tạm cho “quang”" && (await page.$eval("[data-temp-password]", (el) => getComputedStyle(el).fontSize)) === "20px" && (await page.textContent(".dlg .acts button")) === "Sao chép và đóng");
  await page.click(".dlg .acts button");
  await page.waitForSelector(".dlg", { state: "detached" });
  await page.click('[data-more="quang"]');
  await page.click('.menu2 [role="menuitem"]:has-text("Khoá tài khoản")');
  await page.waitForSelector(".dlg .card2");
  check("lock dialog text", (await page.textContent(".dlg h3")) === "Khoá tài khoản “quang”?" && /Quang sẽ bị đăng xuất khỏi mọi thiết bị/.test(await page.textContent(".dlg p")));
  await page.click(".dlg .acts button.btn.r");
  await page.waitForSelector('tr[data-member="quang"][data-status="off"]');
  check("lock → row 'Đã khoá' + 'Mở khoá' button + toast", (await texts(page, 'tr[data-member="quang"] td.acts button')).join("|") === "Mở khoá|⋯" && /Đã khoá “Quang”/.test(await page.textContent(".toasts")));
  await page.click('tr[data-member="quang"] td.acts button:first-child');
  await page.waitForSelector('tr[data-member="quang"][data-status="ok"]');
  await page.click('[data-more="khang"]');
  await page.click('.menu2 [role="menuitem"]:has-text("Xoá thành viên")');
  await page.waitForSelector(".dlg .card2 input");
  check("delete dialog: danger with typed confirm, 'Xoá vĩnh viễn' disabled until the username is typed", (await page.textContent(".dlg h3")) === "Xoá thành viên “nam”?" && (await page.$(".dlg .acts button.btn.r.dis")) !== null && (await page.getAttribute(".dlg input", "placeholder")) === "khang");
  await page.fill(".dlg input", "khang");
  await page.waitForSelector(".dlg .acts button.btn.r:not(.dis)");
  await page.click(".dlg .acts button.btn.r");
  await page.waitForFunction(() => !document.querySelector('tr[data-member="khang"]'));
  check("delete → row gone + toast", /Đã xoá thành viên “Khang”/.test(await page.textContent(".toasts")));
  const validBefore = (await page.$$('tr[data-invite="valid"]')).length; // fixture "Mời Đạt" + the one created on the dashboard
  await page.click('tr[data-invite="valid"] button:nth-child(2)');
  await page.waitForFunction((n) => document.querySelectorAll('tr[data-invite="valid"]').length === n - 1, validBefore);
  check("invites: 'Huỷ' revokes (row becomes Đã huỷ)", (await texts(page, "table[data-invites] .st")).includes("Đã huỷ"));
  await page.click('tr[data-invite="expired"] button');
  await page.waitForSelector(".dlg .qrbig img");
  check("invites: 'Tạo lại' opens the result dialog for the fresh invite ('Nhóm cũ')", /Gửi link này cho Nhóm cũ/.test(await page.textContent(".dlg p")));
  await page.keyboard.press("Escape");
  await page.waitForSelector(".dlg", { state: "detached" });
  await page.waitForSelector('tr[data-invite="valid"]');
  await page.click('[data-more="bao"]');
  await page.click('.menu2 [role="menuitem"]:has-text("Xem lịch sử xem")');
  await page.waitForURL("**/admin/activity?kind=view&userId=*");
  check("'Xem lịch sử xem' deep-links to the activity tab filtered by Xem + person", (await page.textContent(".toolbar .chip.on")) === "Xem" && /Người: Bảo ▾/.test(await page.textContent("[data-person-filter]")), `${await page.textContent(".toolbar .chip.on")} ${await page.textContent("[data-person-filter]")}`);
  // queue (fresh fixture: deleting "khang" above cascaded his failed job away)
  await seed({ fixture: "admin-data" });
  await goto(page, "/admin/queue");
  await page.waitForSelector("table[data-queue] tr[data-job]");
  check("queue: slots a/b indicator, 4 rows (2 downloading w/ 160px mini bar + %, app-queued 'Xếp hàng' w/ Ưu tiên, failed w/ Thử lại/Xoá), done-today table", /^\d+\/\d+ slot$/.test(await page.textContent(".slots span")) && (await page.$$(".slots i")).length >= 6 && (await page.$$("table[data-queue] tr[data-job]")).length === 4 && (await page.$eval('tr[data-job="downloading"] .mini', (el) => el.getBoundingClientRect().width)) === 160 && /73%/.test(await page.textContent('tr[data-job="downloading"]')) && (await texts(page, "tr[data-app-queued] button")).join("|") === "Ưu tiên|Huỷ" && (await texts(page, 'tr[data-job="error"] button')).join("|") === "Thử lại|Xoá" && (await texts(page, 'tr[data-job="error"] .st')).join() === "Thất bại · 0 seed" && (await page.$$("table[data-done-today] tr")).length === 3);
  await page.click('tr[data-job="error"] button:nth-child(2)');
  await page.waitForFunction(() => !document.querySelector('tr[data-job="error"]'));
  await page.click('tr[data-job="downloading"] button');
  await page.waitForFunction(() => document.querySelectorAll("table[data-queue] tr[data-job]").length === 2);
  check("queue: Xoá removes the failed row, Huỷ cancels a download (rows 4 → 2)", (await page.$$("table[data-queue] tr[data-job]")).length === 2);
  await seed({ fixture: "clear-cloud-jobs" });
  await page.waitForSelector(".emptybox", { timeout: 10000 });
  check("queue: empty → 'Không có gì đang tải' box (live poll)", (await page.textContent(".emptybox .emptytitle")) === "Không có gì đang tải" && /0\/\d+ slot/.test(await page.textContent(".slots span")));
  // activity
  await goto(page, "/admin/activity");
  await page.waitForSelector("[data-activity] div[data-kind]");
  const n0 = (await page.$$("[data-activity] div[data-kind]")).length;
  check("activity: 6 chips (Tất cả on) + 'Người: Tất cả ▾' + Xuất CSV; timeline rows 'HH:MM <b>Name</b> …'", (await texts(page, ".toolbar .chip")).join("|") === "Tất cả|Xem|Tải cloud|Dịch AI|Đăng nhập|Mời|Người: Tất cả ▾" && (await page.textContent(".toolbar button")) === "Xuất CSV" && n0 >= 8 && (await page.$("[data-activity] div[data-kind] small")) !== null && (await page.$("[data-activity] div[data-kind] b")) !== null);
  await page.click('.toolbar .chip:has-text("Mời")');
  await page.waitForFunction((n) => document.querySelectorAll("[data-activity] div[data-kind]").length < n, n0);
  check("activity: 'Mời' chip → only invite/join rows", (await page.$$eval("[data-activity] div[data-kind]", (els) => els.every((e) => /^(invite|join)$/.test(e.dataset.kind)))));
  await page.click("[data-person-filter]");
  await page.click('.menu2 [role="menuitem"]:has-text("An")');
  await page.waitForFunction(() => /Người: An ▾/.test(document.querySelector("[data-person-filter]")?.textContent ?? "") && document.querySelectorAll("[data-activity] div[data-kind]").length <= 1, null, { timeout: 10000 }).catch(() => {});
  check("activity: person menu filters (An has no invite rows) + relabels the chip", (await page.$$("[data-activity] div[data-kind]")).length <= 1 && /Người: An ▾/.test(await page.textContent("[data-person-filter]")), `${(await page.$$("[data-activity] div[data-kind]")).length} rows`);
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click(".toolbar button")]);
  check("activity: 'Xuất CSV' downloads lumen-activity-*.csv", /^lumen-activity-.*\.csv$/.test(dl.suggestedFilename()));
}

async function mobileChecks(page) {
  await goto(page, "/settings?tab=tv");
  await page.waitForSelector(".tvbox");
  const mSet = await page.evaluate(() => ({ cols: getComputedStyle(document.querySelector(".set")).gridTemplateColumns, tab: document.querySelector(".tabbar div.on span")?.textContent, sw: document.documentElement.scrollWidth, tv: document.querySelector(".tvbox")?.scrollWidth }));
  check("390px settings: nav stacks above the content (single column), tab bar 'Hồ sơ' on, no horizontal overflow", mSet.cols.split(" ").length === 1 && mSet.tab === "Hồ sơ" && mSet.sw <= 390, JSON.stringify(mSet));
  await goto(page, "/admin/users");
  await page.waitForSelector("table[data-members] tr[data-member]");
  const mTbl = await page.evaluate(() => { const el = document.querySelector("table[data-members]").parentElement; return { over: el.scrollWidth > el.clientWidth, ox: getComputedStyle(el).overflowX, sw: document.documentElement.scrollWidth }; });
  check("390px admin: members table scrolls sideways inside .tbl, page itself does not overflow", mTbl.over && mTbl.ox === "auto" && mTbl.sw <= 390, JSON.stringify(mTbl));
  await goto(page, "/admin");
  check("390px dashboard: chart + watching cards stack", (await page.$eval(".dashgrid", (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length)) === 1);
}

async function main() {
  const browser = await chromium.launch();
  seeder = await request.newContext();
  await seeder.post(BASE + "/api/auth/login", { data: { username: ADMIN.u, password: ADMIN.p, remember: false } });
  await seeder.post(BASE + "/api/dev/scenario", { data: { flags: [] } });
  await seed({ fixture: "admin-data" });
  await seed({ fixture: "os-quota", remaining: 19, resetInHours: 22 });
  const a = await newCtx(browser, ADMIN);
  const page = await a.ctx.newPage();
  await settingsChecks(page, check);
  await seed({ fixture: "admin-data" });
  await adminChecks(page);
  await page.close();
  const m = await newCtx(browser, ADMIN, { width: 390, height: 844 }, true);
  const mp = await m.ctx.newPage();
  await mobileChecks(mp);
  await mp.close();
  // member → 403 inside the shell
  await seed({ fixture: "user", username: "qa_p6_ux", displayName: "Khách", password: "KhachPass123", onboarded: true });
  const mem = await newCtx(browser, { u: "qa_p6_ux", p: "KhachPass123" });
  const memPage = await mem.ctx.newPage();
  await goto(memPage, "/admin/users");
  check("member on /admin/users → 403 box 'Bạn không có quyền xem trang này' with header, no admin tabs", (await memPage.textContent(".emptybox .emptytitle")) === "Bạn không có quyền xem trang này" && (await memPage.$(".atabs")) === null && (await memPage.$("header .logo")) !== null);
  await goto(memPage, "/settings?tab=profile");
  check("member settings: role 'Thành viên', no admin link", (await memPage.textContent('[data-settings="profile"] .fld:nth-of-type(4) > div:last-child')) === "Thành viên");
  await memPage.close();
  const errors = [...a.consoleErrors, ...m.consoleErrors, ...mem.consoleErrors];
  check("0 console errors across settings / admin / mobile / member pages", errors.length === 0, errors.slice(0, 3).join(" || "));
  await seed({ fixture: "clear-admin-data" });
  await seed({ fixture: "delete-user", username: "qa_p6_ux" });
  await seed({ fixture: "os-quota", remaining: null });
  for (const c of [a, m, mem]) { await c.ctx.request.post(BASE + "/api/auth/logout").catch(() => {}); await c.ctx.close(); }
  await seeder.post(BASE + "/api/auth/logout").catch(() => {});
  await seeder.dispose();
  await browser.close();
  report.finish();
}

main().catch((err) => { console.error(err); process.exit(1); });
