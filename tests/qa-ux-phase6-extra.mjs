// Phase 6 extra UX (moved from the tester's p6-ux-extra, Playwright, RUNNING dev server with LUMEN_SCENARIOS=1): keyboard-only
// settings + admin dialogs (focus trap, Esc / Huỷ / confirm all return focus to the trigger, typed-confirm delete, ⋯ menu,
// radio-group arrows + Space on segmented controls), "Gửi lại link" dialog, temp-password login redirect + gate, 390 px
// usability (no clipped controls incl. the hand-off seg, active tab strip entry in view, tables scroll inside .tbl,
// dialogs + ⋯ menu inside the viewport), 0 console errors on every settings / admin tab and dialog at both viewports.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, request } from "@playwright/test";
import { adminCreds, makeReporter, readEnv, sleep } from "./qa-shared-helpers.mjs";
import { BASE, goto } from "./qa-ux-phase6-helpers.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ADMIN = adminCreds(readEnv(ROOT));
const report = makeReporter();
const { check, note } = report;
const IGNORED = /status of (400|401|403|404|409|410|429)|net::ERR_FAILED/;
const active = (page) => page.evaluate(() => { const a = document.activeElement; return { tag: a?.tagName, text: a?.textContent?.trim().slice(0, 40), inDlg: Boolean(a?.closest(".dlg")), inMenu: Boolean(a?.closest(".menu2")), more: a?.getAttribute("data-more"), cls: a?.className }; });
const clipped = (page, sel, w) => page.$$eval(sel, (els, w) => els.filter((e) => { const r = e.getBoundingClientRect(); const vis = r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden"; return vis && (r.left < 0 || r.right > w + 0.5); }).map((e) => `${e.tagName}.${e.className}:${e.textContent?.trim().slice(0, 20)}@${Math.round(e.getBoundingClientRect().right)}`), w);
const closeDialog = async (page, how) => {
  if (how === "esc") await page.keyboard.press("Escape");
  else await page.click(`.dlg .acts button:has-text("${how}")`);
  await page.waitForSelector(".dlg", { state: "detached" });
  await sleep(80);
  return active(page);
};

async function ctxFor(browser, user, vp, mobile, errors) {
  const ctx = await browser.newContext({ viewport: vp, isMobile: mobile, hasTouch: mobile, locale: "vi-VN", permissions: ["clipboard-read", "clipboard-write"] });
  ctx.on("page", (p) => { p.on("console", (m) => { if (m.type() === "error" && !IGNORED.test(m.text())) errors.push(`${vp.width}px ${p.url().replace(BASE, "")} :: ${m.text().slice(0, 160)}`); }); p.on("pageerror", (e) => errors.push(`${vp.width}px ${p.url().replace(BASE, "")} :: pageerror ${String(e).slice(0, 160)}`)); });
  const r = await ctx.request.post(BASE + "/api/auth/login", { data: { username: user.u, password: user.p, remember: true } });
  if (!r.ok()) throw new Error(`login ${user.u} ${r.status()}`);
  return ctx;
}

async function keyboardSettings(page) {
  await goto(page, "/settings?tab=profile");
  await page.focus(".set nav2 a.on");
  await page.keyboard.press("Tab"); await page.keyboard.press("Enter");
  await page.waitForURL("**/settings?tab=playback");
  check("kbd settings: Tab from the active nav link → next link, Enter → Phát tab", /tab=playback/.test(page.url()) && (await page.textContent(".set nav2 a.on")) === "Phát");
  // TV revoke dialog by keyboard: focus trap, Esc / Huỷ / confirm all return focus to the trigger
  await goto(page, "/settings?tab=tv");
  await page.waitForSelector('.tvbox[data-token="active"] .qr img');
  await page.focus(".tvbox button:nth-of-type(3)");
  await page.keyboard.press("Enter");
  await page.waitForSelector(".dlg .card2");
  const a1 = await active(page);
  for (let i = 0; i < 6; i++) await page.keyboard.press("Tab");
  const a2 = await active(page);
  const a3 = await closeDialog(page, "esc");
  check("kbd tv: Enter on 'Thu hồi link' opens the dialog with focus inside; 6×Tab stays trapped; Esc returns focus to the button", a1.inDlg && a2.inDlg && a3.text === "Thu hồi link", JSON.stringify([a1, a2, a3]));
  await page.keyboard.press("Enter");
  await page.waitForSelector(".dlg .card2");
  const a4 = await closeDialog(page, "Huỷ");
  check("kbd tv: Enter right after Esc reopens it (focus really sits on the button); 'Huỷ' click also returns focus", a4.text === "Thu hồi link", JSON.stringify(a4));
  await page.keyboard.press("Enter");
  await page.waitForSelector(".dlg .card2");
  await page.click('.dlg .acts button:has-text("Thu hồi")');
  await page.waitForSelector('.tvbox[data-token="revoked"]', { timeout: 10000 });
  await sleep(150);
  const a5 = await active(page);
  check("kbd tv: confirming 'Thu hồi' → revoked state + 'Tạo link mới'; focus lands on that same (third) button", (await page.textContent("[data-manifest]")) === "— đã thu hồi, bấm Tạo link mới —" && a5.text === "Tạo link mới", JSON.stringify(a5));
  await page.keyboard.press("Enter");
  await page.waitForSelector('.tvbox[data-token="active"] .qr img', { timeout: 10000 });
  await page.focus('[data-settings="tv"] .fld button'); await page.keyboard.press("Enter");
  await page.waitForSelector(".dlg .card2");
  const a6 = await closeDialog(page, "esc");
  check("kbd tv: 'Xem hướng dẫn' dialog Esc → focus back on the button", a6.text === "Xem hướng dẫn", JSON.stringify(a6));
  // swatches by keyboard
  await goto(page, "/settings?tab=profile");
  await page.focus('.swatch i[data-color="#e50914"]').catch(() => {});
  await page.keyboard.press("Enter");
  await sleep(400);
  check("kbd profile: avatar swatches are focusable and Enter picks one", (await page.getAttribute('.swatch i[data-color="#e50914"]', "class")) === "on");
  await page.click('.swatch i[data-color="#2d6cdf"]');
  await sleep(300);
  // segmented controls: radio group semantics (one tab stop, arrows move + select, Space selects)
  await goto(page, "/settings?tab=playback");
  const tabStops = await page.$$eval('[data-settings="playback"] .fld:nth-of-type(1) .seg span', (ss) => ss.map((s) => s.getAttribute("tabindex")));
  await page.focus('[data-settings="playback"] .seg span.on');
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(() => document.querySelector('[data-settings="playback"] .seg span.on')?.textContent === "4K", null, { timeout: 3000 }).catch(() => {});
  const afterRight = await page.textContent('[data-settings="playback"] .seg span.on');
  const focusAfterRight = (await active(page)).text;
  await page.keyboard.press("ArrowLeft");
  await page.waitForFunction(() => document.querySelector('[data-settings="playback"] .seg span.on')?.textContent === "1080p", null, { timeout: 3000 }).catch(() => {});
  await page.keyboard.press("Tab");
  const nextStop = await active(page);
  check("kbd playback: quality seg = one tab stop (only the selected option tabbable); ArrowRight selects + focuses 4K, ArrowLeft back; Tab leaves the group", tabStops.join() === "0,-1" && afterRight === "4K" && focusAfterRight === "4K" && (await page.textContent('[data-settings="playback"] .seg span.on')) === "1080p" && !/4K|1080p/.test(nextStop.text ?? ""), JSON.stringify({ tabStops, afterRight, focusAfterRight, nextStop }));
  const handoff = '[data-settings="playback"] .fld:last-of-type .seg';
  await page.focus(`${handoff} span.on`);
  await page.keyboard.press("End");
  await page.waitForFunction((sel) => document.querySelector(`${sel} span.on`)?.textContent === "VLC", handoff, { timeout: 3000 }).catch(() => {});
  await page.keyboard.press("Home");
  await page.waitForFunction((sel) => document.querySelector(`${sel} span.on`)?.textContent === "Tự động", handoff, { timeout: 3000 }).catch(() => {});
  await page.keyboard.press("ArrowRight"); await sleep(300);
  await page.keyboard.press("Space"); await sleep(300);
  check("kbd handoff seg: End → VLC, Home → Tự động, ArrowRight + Space → Stremio stays selected", (await page.textContent(`${handoff} span.on`)) === "Stremio");
  await page.click(`${handoff} span:first-child`); await sleep(300);
  await page.focus('[data-settings="playback"] .fld:nth-of-type(2) .sw');
  const swBefore = await page.getAttribute('[data-settings="playback"] .fld:nth-of-type(2) .sw', "aria-checked");
  await page.keyboard.press("Space"); await sleep(500);
  check("kbd playback: Space toggles a switch (role=switch)", swBefore !== (await page.getAttribute('[data-settings="playback"] .fld:nth-of-type(2) .sw', "aria-checked")));
  await page.keyboard.press("Space"); await sleep(400);
}

/** Radix menus do their open-time focus work asynchronously: a 0 ms synthetic key burst right after opening can lose a key, so menu keys get a human-like gap. */
const menuKey = async (page, k) => { await page.keyboard.press(k); await sleep(80); };

async function keyboardAdmin(page) {
  await goto(page, "/admin/users");
  await page.waitForSelector("table[data-members] tr[data-member]");
  // create-invite dialog: expiry radio group with arrows, "Nhiều lần" with Space, result dialog returns focus to the opener
  await page.focus(".h button.btn.r"); await page.keyboard.press("Enter");
  await page.waitForSelector(".dlg .card2 input");
  const f0 = await active(page);
  await page.keyboard.type("Mời Đạt");
  await page.keyboard.press("Tab");
  const f1 = await active(page);
  await page.keyboard.press("ArrowRight"); await sleep(150);
  const expiryAfterArrow = await page.textContent(".dlg .seg span.on");
  await page.keyboard.press("Tab"); await page.keyboard.press("Tab");
  const f2 = await active(page);
  await page.keyboard.press("Space"); await sleep(150);
  const usesAfterSpace = await page.getAttribute("[data-uses]", "data-uses");
  check("kbd invite dialog: note autofocused; Tab → expiry group ('7 ngày' is the single stop); ArrowRight → '14 ngày'; Tab Tab → 'Nhiều lần', Space selects it", f0.tag === "INPUT" && f1.text === "7 ngày" && expiryAfterArrow === "14 ngày" && f2.text === "Nhiều lần" && usesAfterSpace === "many", JSON.stringify([f0, f1, expiryAfterArrow, f2, usesAfterSpace]));
  await page.focus(".dlg .acts button.btn.r"); await page.keyboard.press("Enter");
  await page.waitForSelector(".dlg .qrbig img");
  const back = await closeDialog(page, "esc");
  check("kbd invite: Enter on 'Tạo link' → result dialog; Esc closes; focus returns to '＋ Tạo link mời'", back.text === "＋ Tạo link mời", JSON.stringify(back));
  // ⋯ menu by keyboard → delete dialog → Esc → focus back on the same ⋯
  await page.focus('[data-more="quang"]'); await menuKey(page, "Enter");
  await page.waitForSelector(".menu2 [role='menuitem']");
  const m0 = await active(page);
  await menuKey(page, "End");
  const mEnd = await active(page);
  await menuKey(page, "Enter");
  await page.waitForSelector(".dlg .card2 input");
  const d0 = await active(page);
  const d2 = await closeDialog(page, "esc");
  check("kbd ⋯: Enter opens the menu focused; End → 'Xoá thành viên'; Enter → delete dialog (focus inside); Esc → focus back on ⋯ (same row)", m0.inMenu && mEnd.text === "Xoá thành viên" && d0.inDlg && d2.more === "quang", JSON.stringify([m0, mEnd, d0, d2]));
  // lock dialog: Huỷ click + confirm both return focus to ⋯
  await page.focus('[data-more="quang"]'); await menuKey(page, "Enter");
  await page.waitForSelector(".menu2 [role='menuitem']");
  await menuKey(page, "ArrowUp"); await menuKey(page, "ArrowUp");
  const lk = await active(page);
  await menuKey(page, "Enter");
  await page.waitForSelector(".dlg .card2");
  const l1 = await closeDialog(page, "Huỷ");
  await page.focus('[data-more="quang"]'); await menuKey(page, "Enter");
  await page.waitForSelector(".menu2 [role='menuitem']");
  await menuKey(page, "ArrowUp"); await menuKey(page, "ArrowUp"); await menuKey(page, "Enter");
  await page.waitForSelector(".dlg .card2");
  await page.click('.dlg .acts button:has-text("Khoá")');
  await page.waitForSelector('tr[data-member="quang"][data-status="off"]');
  await sleep(150);
  const l2 = await active(page);
  check("kbd lock: ArrowUp×2 wraps to 'Khoá tài khoản'; 'Huỷ' click → focus on ⋯; confirming the lock → focus on the row's ⋯ again", lk.text === "Khoá tài khoản" && l1.more === "quang" && l2.more === "quang", JSON.stringify([lk, l1, l2]));
  await page.click('tr[data-member="quang"] td.acts button:first-child');
  await page.waitForSelector('tr[data-member="quang"][data-status="ok"]');
  // reset-password dialog via ⋯ → "Sao chép và đóng" returns focus
  await page.focus('[data-more="quang"]'); await menuKey(page, "Enter");
  await page.waitForSelector(".menu2 [role='menuitem']"); await menuKey(page, "Enter");
  await page.waitForSelector("[data-temp-password]");
  const r1 = await closeDialog(page, "Sao chép và đóng");
  check("kbd reset: 'Sao chép và đóng' → focus back on ⋯", r1.more === "quang", JSON.stringify(r1));
  // "Gửi lại link" for dat (never logged in) → login link + temp password, shown once
  await page.focus('tr[data-member="dat"] td.acts button:first-child'); await page.keyboard.press("Enter");
  await page.waitForSelector("[data-login-url]");
  const resend = { title: await page.textContent(".dlg h3"), url: await page.textContent("[data-login-url]"), pw: await page.textContent("[data-temp-password]"), text: await page.textContent(".dlg p") };
  await page.click(".dlg .acts button");
  await page.waitForSelector(".dlg", { state: "detached" });
  const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => "");
  check("'Gửi lại link' (dat, never logged in) → dialog with the login link + Gk7-mPx2-Q9w temp password + 48 h note; 'Sao chép và đóng' copies link + username + password", resend.title === "Thông tin đăng nhập cho “dat”" && /\/login$/.test(resend.url) && /^[A-Za-z2-9]{3}-[A-Za-z2-9]{4}-[A-Za-z2-9]{3}$/.test(resend.pw) && /48 giờ/.test(resend.text) && clip.includes(resend.url) && clip.includes("dat") && clip.includes(resend.pw), JSON.stringify(resend));
  // delete by keyboard (typed confirm)
  await page.focus('[data-more="khang"]'); await menuKey(page, "Enter");
  await page.waitForSelector(".menu2 [role='menuitem']"); await menuKey(page, "End"); await menuKey(page, "Enter");
  await page.waitForSelector(".dlg .card2 input");
  await page.focus(".dlg .card2 input");
  await page.keyboard.type("na");
  const disabledMid = await page.$(".dlg .acts button.btn.r.dis");
  await page.keyboard.type("m");
  await page.waitForSelector(".dlg .acts button.btn.r:not(.dis)");
  await page.focus(".dlg .acts button.btn.r"); await page.keyboard.press("Enter");
  await page.waitForFunction(() => !document.querySelector('tr[data-member="khang"]'), null, { timeout: 10000 });
  check("kbd delete: 'Xoá vĩnh viễn' disabled until the full username is typed; keyboard confirm deletes the row", disabledMid !== null && (await page.$('tr[data-member="khang"]')) === null);
  // activity person menu keyboard
  await goto(page, "/admin/activity");
  await page.focus("[data-person-filter]"); await page.keyboard.press("Enter");
  const pm = await page.waitForSelector(".menu2 [role='menuitem']", { timeout: 3000 }).then(() => true).catch(() => false);
  await page.keyboard.press("Escape");
  check("kbd activity: Enter on 'Người: Tất cả ▾' opens the menu", pm);
}

async function tempPasswordLogin(browser, errors) {
  const api = await request.newContext();
  await api.post(BASE + "/api/auth/login", { data: { username: ADMIN.u, password: ADMIN.p, remember: false } });
  const users = (await (await api.get(BASE + "/api/admin/users")).json()).members;
  const quang = users.find((u) => u.username === "quang");
  const temp = (await (await api.post(BASE + `/api/admin/users/${quang.id}/reset-password`)).json()).tempPassword;
  await api.post(BASE + "/api/dev/seed", { data: { fixture: "reset-rate-limit" } });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "vi-VN" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`temp-login :: ${String(e).slice(0, 120)}`));
  await goto(page, "/login");
  await page.fill('input[name="username"]', "quang");
  await page.fill('input[name="password"]', temp);
  await page.keyboard.press("Enter");
  await page.waitForURL("**/settings?tab=profile", { timeout: 15000 }).catch(() => {});
  check("temp password UI: login with the temp code lands on /settings?tab=profile with the 'đổi mật khẩu' note", /settings\?tab=profile/.test(page.url()) && (await page.$("[data-must-change]")) !== null, page.url());
  await goto(page, "/my-list");
  await page.waitForURL("**/settings?tab=profile", { timeout: 10000 }).catch(() => {});
  check("temp password gate: typing another URL (/my-list) bounces back to /settings?tab=profile server-side", /settings\?tab=profile/.test(page.url()), page.url());
  const pw = '[data-form="password"]';
  await page.fill(`${pw} input[autocomplete="current-password"]`, temp);
  await page.fill(`${pw} input[autocomplete="new-password"] >> nth=0`, "QuangMoi12345");
  await page.fill(`${pw} input[autocomplete="new-password"] >> nth=1`, "QuangMoi12345");
  await page.click(`${pw} button[type="submit"]`);
  await page.waitForFunction(() => !document.querySelector("[data-must-change]"), null, { timeout: 5000 }).catch(() => {});
  check("temp password UI: changing it clears the note + success toast; fields emptied", (await page.$("[data-must-change]")) === null && (await page.inputValue(`${pw} input[autocomplete="current-password"]`)) === "" && /mật khẩu/i.test(await page.textContent(".toasts").catch(() => "")));
  await goto(page, "/my-list");
  check("temp password gate lifts after the change (/my-list opens)", /\/my-list/.test(page.url()), page.url());
  await page.evaluate(() => fetch("/api/auth/logout", { method: "POST" }));
  await ctx.close();
  await api.post(BASE + "/api/dev/seed", { data: { fixture: "admin-data" } });
  await api.post(BASE + "/api/auth/logout");
  await api.dispose();
}

async function mobile(page) {
  const W = 390;
  const pages = ["/settings?tab=profile", "/settings?tab=playback", "/settings?tab=subtitles", "/settings?tab=tv", "/settings?tab=sessions", "/admin", "/admin/users", "/admin/queue", "/admin/activity"];
  const bad = [];
  for (const p of pages) {
    await goto(page, p);
    await page.waitForSelector(".set, .admin", { timeout: 15000 });
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    // cells inside a `.tbl` scroll sideways by design (checked separately below); everything else must sit inside the viewport
    const off = (await clipped(page, "button, .btn, .chip, a.on, input, .seg span, .sw", W)).filter((e) => !/^BUTTON\.btn sm/.test(e) || !/@(7\d\d|8\d\d|9\d\d|1\d\d\d)$/.test(e));
    const outsideTbl = await page.$$eval("button, .btn, .chip, a.on, input, .seg span, .sw", (els, w) => els.filter((e) => !e.closest(".tbl")).filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.left < 0 || r.right > w + 0.5); }).map((e) => `${e.tagName}:${e.textContent?.trim().slice(0, 20)}@${Math.round(e.getBoundingClientRect().right)}`), W);
    off.length = 0; off.push(...outsideTbl);
    const tbls = await page.$$eval(".tbl", (els) => els.map((e) => ({ ox: getComputedStyle(e).overflowX, scroll: e.scrollWidth > e.clientWidth })));
    if (sw > W || off.length) bad.push(`${p}: scrollWidth=${sw} clipped=${off.join(",")}`);
    if (tbls.some((t) => t.scroll && t.ox !== "auto" && t.ox !== "scroll")) bad.push(`${p}: table overflow not scrollable`);
  }
  check("390px: no page overflow and no clipped button / chip / seg option (incl. VLC) / input on 5 settings tabs + 4 admin tabs; tables scroll inside .tbl", bad.length === 0, bad.join(" || "));
  await goto(page, "/settings?tab=playback");
  const vlc = await page.$eval('[data-settings="playback"] .fld:last-of-type .seg span:last-child', (s) => Math.round(s.getBoundingClientRect().right));
  await page.tap('[data-settings="playback"] .fld:last-of-type .seg span:last-child');
  await page.waitForFunction(() => document.querySelector('[data-settings="playback"] .fld:last-of-type .seg span.on')?.textContent === "VLC", null, { timeout: 3000 }).catch(() => {});
  check(`390px hand-off seg: 'VLC' inside the viewport (right ${vlc}) and tappable`, vlc <= W && (await page.textContent('[data-settings="playback"] .fld:last-of-type .seg span.on')) === "VLC");
  await page.tap('[data-settings="playback"] .fld:last-of-type .seg span:first-child'); await sleep(300);
  const inView = (sel) => page.$eval(sel, (a) => { const r = a.getBoundingClientRect(); const p = a.parentElement.getBoundingClientRect(); return r.left >= p.left - 1 && r.right <= p.right + 1; });
  await goto(page, "/admin/activity");
  const atab = await inView(".atabs a.on");
  await goto(page, "/settings?tab=sessions");
  const stab = await inView(".set nav2 a.on");
  check("390px: the active admin tab ('Nhật ký') and the active settings nav entry ('Phiên đăng nhập') are scrolled into view", atab && stab, JSON.stringify({ atab, stab }));
  // dialogs + menu at 390
  await goto(page, "/admin/users");
  await page.waitForSelector("table[data-members] tr[data-member]");
  await page.tap('[data-more="quang"]');
  await page.waitForSelector(".menu2 [role='menuitem']");
  const menu = await page.$eval(".menu2", (m) => { const r = m.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right) }; });
  await page.keyboard.press("Escape");
  await page.tap(".h button.btn.r");
  await page.waitForSelector(".dlg .card2 input");
  const card = await page.$eval(".dlg .card2", (c) => { const r = c.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width) }; });
  const dlgClipped = await clipped(page, ".dlg button, .dlg .seg span, .dlg input", W);
  await page.fill(".dlg .card2 input", "Mời Đạt");
  await page.tap(".dlg .acts button.btn.r");
  await page.waitForSelector(".dlg .qrbig img");
  const qr = await page.$eval(".qrbig", (e) => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), r: Math.round(r.right) }; });
  const resClipped = await clipped(page, ".dlg button, .dlg code", W);
  await page.keyboard.press("Escape");
  await page.waitForSelector(".dlg", { state: "detached" });
  check(`390px: ⋯ menu inside the viewport (${menu.l}-${menu.r}), invite dialog card ${card.w}px inside, QR ${qr.w}px visible, nothing clipped`, menu.l >= 0 && menu.r <= W && card.l >= 0 && card.r <= W && dlgClipped.length === 0 && qr.r <= W && resClipped.length === 0, JSON.stringify({ menu, card, dlgClipped, qr, resClipped }));
  await goto(page, "/admin/queue");
  await page.waitForSelector("table[data-queue] tr[data-job]");
  const q = await page.evaluate(() => { const w = document.querySelector("table[data-queue]").parentElement; w.scrollLeft = w.scrollWidth; const b = document.querySelector('tr[data-job="downloading"] button'); const r = b.getBoundingClientRect(); return { right: Math.round(r.right), left: Math.round(r.left) }; });
  check("390px queue: after scrolling .tbl, the row's Huỷ button is inside the viewport", q.left >= 0 && q.right <= W, JSON.stringify(q));
}

async function consoleSweep(browser, errors) {
  for (const [vp, mob] of [[{ width: 1440, height: 900 }, false], [{ width: 390, height: 844 }, true]]) {
    const ctx = await ctxFor(browser, ADMIN, vp, mob, errors);
    const page = await ctx.newPage();
    for (const p of ["/settings?tab=profile", "/settings?tab=playback", "/settings?tab=subtitles", "/settings?tab=tv", "/settings?tab=sessions", "/admin", "/admin/users", "/admin/queue", "/admin/activity", "/admin/activity?kind=view&userId=1"]) { await goto(page, p); await sleep(300); }
    await goto(page, "/admin/users"); await page.waitForSelector("table[data-members] tr[data-member]");
    for (const sel of ['[data-more="quang"]', '.menu2 [role="menuitem"]:has-text("Đặt lại mật khẩu")']) { await page.click(sel); await sleep(400); }
    await page.keyboard.press("Escape"); await sleep(200);
    await page.click('[data-more="quang"]'); await page.click('.menu2 [role="menuitem"]:has-text("Khoá tài khoản")'); await sleep(300); await page.keyboard.press("Escape");
    await page.click('[data-more="khang"]').catch(() => {}); await page.click('.menu2 [role="menuitem"]:has-text("Xoá thành viên")').catch(() => {}); await sleep(300); await page.keyboard.press("Escape");
    await page.click(".h button.btn.r"); await sleep(300); await page.keyboard.press("Escape");
    await goto(page, "/settings?tab=tv"); await page.click(".tvbox button:nth-of-type(3)"); await sleep(300); await page.keyboard.press("Escape");
    await ctx.request.post(BASE + "/api/auth/logout").catch(() => {});
    await ctx.close();
  }
}

async function main() {
  const browser = await chromium.launch();
  const seeder = await request.newContext();
  await seeder.post(BASE + "/api/auth/login", { data: { username: ADMIN.u, password: ADMIN.p, remember: false } });
  await seeder.post(BASE + "/api/dev/scenario", { data: { flags: [] } });
  await seeder.post(BASE + "/api/dev/seed", { data: { fixture: "admin-data" } });
  const errors = [];
  const guard = async (name, fn) => { try { await fn(); } catch (err) { check(`${name}: section aborted`, false, String(err).split("\n")[0].slice(0, 200)); } };
  const d = await ctxFor(browser, ADMIN, { width: 1440, height: 900 }, false, errors);
  const page = await d.newPage();
  await guard("keyboardSettings", () => keyboardSettings(page));
  await seeder.post(BASE + "/api/dev/seed", { data: { fixture: "admin-data" } });
  await guard("keyboardAdmin", () => keyboardAdmin(page));
  await page.close(); await d.request.post(BASE + "/api/auth/logout").catch(() => {}); await d.close();
  await seeder.post(BASE + "/api/dev/seed", { data: { fixture: "admin-data" } });
  await guard("tempPasswordLogin", () => tempPasswordLogin(browser, errors));
  const m = await ctxFor(browser, ADMIN, { width: 390, height: 844 }, true, errors);
  const mp = await m.newPage();
  await guard("mobile", () => mobile(mp));
  await mp.close(); await m.request.post(BASE + "/api/auth/logout").catch(() => {}); await m.close();
  await seeder.post(BASE + "/api/dev/seed", { data: { fixture: "admin-data" } });
  await guard("consoleSweep", () => consoleSweep(browser, errors));
  check("0 console errors across all settings tabs / admin tabs / dialogs at 1440 + 390 and the temp-password login", errors.length === 0, errors.slice(0, 4).join(" || "));
  note(`checks ran against ${BASE}`);
  await seeder.post(BASE + "/api/dev/seed", { data: { fixture: "clear-admin-data" } });
  await seeder.post(BASE + "/api/auth/logout");
  await seeder.dispose();
  await browser.close();
  report.finish();
}
main().catch((err) => { console.error(err); process.exit(1); });
