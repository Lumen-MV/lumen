// Phase 1 UX / behaviour checks with Playwright against a RUNNING dev server (LUMEN_SCENARIOS=1).
//   node tests/qa-ux-phase1-playwright.mjs [--base http://localhost:3000]
// Admin creds come from .env.local (never printed). Uses its own member "qa_ux".
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, request } from "@playwright/test";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const BASE = args.includes("--base") ? args[args.indexOf("--base") + 1] : "http://localhost:3000";
const SHOTS = path.join(ROOT, "qa", "ux");
fs.mkdirSync(SHOTS, { recursive: true });

function readEnv() {
  const env = {};
  for (const f of [".env.local", ".env"]) {
    const p = path.join(ROOT, f);
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
const ENV = readEnv();
const ADMIN = { u: ENV.ADMIN_USERNAME, p: ENV.ADMIN_PASSWORD };
const MEMBER = { u: "qa_ux", p: "QaUxPass123", name: "Bảo" };

const out = [];
let fails = 0;
const check = (name, ok, detail = "") => { out.push(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`); if (!ok) fails++; };
const note = (s) => out.push(`NOTE ${s}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** /api/dev/seed requires an admin session → one dedicated API context, independent of the browser contexts' cookies. */
let seederReq;
async function startSeeder() {
  seederReq = await request.newContext();
  const r = await seederReq.post(BASE + "/api/auth/login", { data: { username: ADMIN.u, password: ADMIN.p, remember: false } });
  if (!r.ok()) { console.error(`seeder admin login failed: ${r.status()}`); process.exit(2); }
}
async function seedPost(fixture) {
  const r = await seederReq.post(BASE + "/api/dev/seed", { data: fixture });
  return { status: r.status(), json: await r.json().catch(() => ({})) };
}
async function stopSeeder() {
  await seederReq.post(BASE + "/api/auth/logout").catch(() => {});
  await seederReq.dispose();
}

async function newCtx(browser, mobile = false) {
  const ctx = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: mobile, hasTouch: mobile, locale: "vi-VN" });
  const consoleErrors = [];
  ctx.on("page", (p) => {
    p.on("console", (m) => { if (m.type() === "error") consoleErrors.push(`${p.url()} :: ${m.text().slice(0, 200)}`); });
    p.on("pageerror", (e) => consoleErrors.push(`${p.url()} :: pageerror ${String(e).slice(0, 200)}`));
  });
  const post = async (p, data) => { const r = await ctx.request.post(BASE + p, { data }); return { status: r.status(), json: await r.json().catch(() => ({})) }; };
  const get = async (p) => { const r = await ctx.request.get(BASE + p); return { status: r.status(), json: await r.json().catch(() => ({})) }; };
  return { ctx, consoleErrors, post, get, seed: seedPost, login: (u, p) => post("/api/auth/login", { username: u, password: p, remember: true }) };
}

const focusInfo = (page) => page.evaluate(() => {
  const el = document.activeElement;
  if (!el) return null;
  const cs = getComputedStyle(el);
  return { tag: el.tagName, name: el.getAttribute("name") || el.getAttribute("placeholder") || el.className || el.textContent?.trim().slice(0, 20), type: el.getAttribute("type"), outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth, outlineColor: cs.outlineColor, boxShadow: cs.boxShadow };
});

async function main() {
  const browser = await chromium.launch();
  await startSeeder();
  // ------------------------------------------------------------------ desktop
  const d = await newCtx(browser);
  await d.seed({ fixture: "reset-rate-limit" });
  await d.seed({ fixture: "delete-user", username: MEMBER.u });
  const page = await d.ctx.newPage();

  // --- /login keyboard-only flow + focus ring
  await page.goto(BASE + "/login");
  await page.waitForLoadState("networkidle");
  let f = await focusInfo(page);
  check("login: username autofocused", f?.tag === "INPUT" && f?.name === "username", JSON.stringify(f));
  await page.keyboard.type(ADMIN.u);
  await page.keyboard.press("Tab");
  f = await focusInfo(page);
  check("login: Tab → password", f?.name === "password", JSON.stringify(f));
  note(`login: focus ring on password (keyboard): outline=${f?.outlineStyle} ${f?.outlineWidth} ${f?.outlineColor}`);
  check("login: keyboard focus ring visible on input", f?.outlineStyle !== "none" && f?.outlineWidth !== "0px", `${f?.outlineStyle} ${f?.outlineWidth}`);
  await page.keyboard.type("wrong-password");
  const tabOrder = [];
  for (let i = 0; i < 4; i++) { await page.keyboard.press("Tab"); const fi = await focusInfo(page); tabOrder.push(`${fi?.tag}:${fi?.type || fi?.name}`); }
  note(`login: Tab order after password → ${tabOrder.join(" → ")}`);
  check("login: Tab order reaches checkbox then submit button", tabOrder.some((t) => t.startsWith("INPUT:checkbox")) && tabOrder.some((t) => t.startsWith("BUTTON")), tabOrder.join(","));
  // submit via Enter inside the password field
  await page.focus('input[name="password"]');
  await page.keyboard.press("Enter");
  await page.waitForSelector(".form input.bad", { timeout: 5000 });
  const errText = await page.textContent(".form .err");
  check("login: Enter submits; wrong → .bad + 'Sai tên đăng nhập hoặc mật khẩu.'", errText?.trim() === "Sai tên đăng nhập hoặc mật khẩu.", errText || "");
  const shaken = await page.$(".form input.bad.shake");
  check("login: wrong → shake class applied", Boolean(shaken));
  const pwCleared = await page.inputValue('input[name="password"]');
  note(`login: password field after wrong attempt = ${pwCleared ? "kept (" + pwCleared.length + " chars)" : "cleared"}`);
  // eye toggle
  await page.click(".form .eye");
  check("login: eye toggles password → text", (await page.getAttribute('input[name="password"]', "type")) === "text");
  await page.click(".form .eye");
  // rate limit via API from same context (same IP as the browser), then UI countdown
  for (let i = 0; i < 4; i++) await d.login(ADMIN.u, "bad-" + i);
  await page.fill('input[name="password"]', "bad-5");
  await page.click(".form button.btn.r");
  await page.waitForSelector(".form button.btn.r.dis", { timeout: 5000 });
  const rateText = await page.textContent(".form .err");
  check("login: 429 → button .dis + countdown text", /^Sai 5 lần\. Thử lại sau \d:\d\d\.$/.test(rateText?.trim() || ""), rateText || "");
  const t1 = rateText; await sleep(1600); const t2 = await page.textContent(".form .err");
  check("login: countdown ticks", t1 !== t2, `${t1} → ${t2}`);
  check("login: submit disabled during countdown", await page.isDisabled(".form button.btn.r"));
  await page.screenshot({ path: path.join(SHOTS, "login-rate-countdown.png") });
  await d.seed({ fixture: "reset-rate-limit" });
  // offline toast with Thử lại action
  await page.reload(); await page.waitForLoadState("networkidle");
  await page.route("**/api/auth/login", (r) => r.abort("failed"));
  await page.fill('input[name="username"]', ADMIN.u); await page.fill('input[name="password"]', ADMIN.p);
  await page.click(".form button.btn.r");
  await page.waitForSelector(".toast.err", { timeout: 5000 });
  const toastTxt = await page.textContent(".toast.err");
  check("login: network failure → err toast with 'Thử lại' action", toastTxt?.includes("Không kết nối được máy chủ") && Boolean(await page.$(".toast.err .act")), toastTxt || "");
  const hasX = await page.$(".toast.err .x");
  check("login: offline toast has no close ✕ (mockup login-offline has none)", !hasX);
  await page.unroute("**/api/auth/login");
  // real login via Enter with ?next=
  await page.goto(BASE + "/login?next=/dev/ui?state=buttons"); await page.waitForLoadState("networkidle");
  await page.fill('input[name="username"]', ADMIN.u); await page.fill('input[name="password"]', ADMIN.p);
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/dev\/ui/, { timeout: 15000 }).catch(() => {});
  check("login: Enter submits and honours ?next=", page.url().includes("/dev/ui?state=buttons"), page.url());
  const loginWhileAuthed = await d.get("/login");
  note(`GET /login while logged in → ${loginWhileAuthed.status} (expected redirect home)`);

  // --- header solid after scroll ≥ 40px
  await page.goto(BASE + "/dev/ui?state=buttons"); await page.waitForLoadState("networkidle");
  await page.evaluate(() => { const s = document.createElement("div"); s.style.height = "3000px"; document.body.appendChild(s); });
  await page.evaluate(() => window.scrollTo(0, 39)); await sleep(150);
  const at39 = await page.evaluate(() => ({ solid: document.querySelector("header")?.classList.contains("solid"), bg: getComputedStyle(document.querySelector("header")).backgroundColor }));
  await page.evaluate(() => window.scrollTo(0, 40)); await sleep(150);
  const at40 = await page.evaluate(() => ({ solid: document.querySelector("header")?.classList.contains("solid"), bg: getComputedStyle(document.querySelector("header")).backgroundColor, bgImage: getComputedStyle(document.querySelector("header")).backgroundImage }));
  check("header: not solid at scrollY=39, solid at 40", at39.solid === false && at40.solid === true, JSON.stringify({ at39, at40 }));
  check("header: solid bg = #141414", at40.bg === "rgb(20, 20, 20)", at40.bg);
  note(`header solid still has gradient background-image: ${at40.bgImage !== "none"}`);
  await page.evaluate(() => window.scrollTo(0, 0));
  const nav = await page.$$eval("header nav a", (as) => as.map((a) => `${a.textContent}${a.classList.contains("on") ? "*" : ""}`));
  check("header: 5 nav items in mockup order", nav.join("|").replace(/\*/g, "") === "Trang chủ|Phim lẻ|Phim bộ|Anime|Danh sách của tôi", nav.join("|"));

  // --- ? opens shortcuts dialog, Esc closes
  await page.keyboard.press("Shift+?");
  const kbdOpen = await page.waitForSelector(".dlg .kbd", { timeout: 3000 }).catch(() => null);
  check("`?` opens shortcuts dialog (.dlg .kbd)", Boolean(kbdOpen));
  const kbdRows = await page.$$eval(".dlg .kbd span", (s) => s.map((x) => x.textContent?.trim()));
  check("shortcuts dialog has 10 rows, first 'Tìm kiếm /', 'Đóng Esc'", kbdRows.length === 10 && kbdRows[0]?.startsWith("Tìm kiếm") && kbdRows[1]?.startsWith("Đóng"), kbdRows.join(" ; "));
  const kbdTitle = await page.textContent(".dlg h3");
  check("shortcuts dialog title 'Phím tắt'", kbdTitle?.trim() === "Phím tắt", kbdTitle || "");
  await page.keyboard.press("Escape");
  await sleep(300);
  check("Esc closes shortcuts dialog", !(await page.$(".dlg .kbd")));
  // ? inside an input must NOT open the dialog
  await page.evaluate(() => { const i = document.createElement("input"); i.id = "qa-inp"; document.body.appendChild(i); i.focus(); });
  await page.keyboard.press("Shift+?"); await sleep(200);
  check("`?` typed inside an input does not open the dialog", !(await page.$(".dlg .kbd")));

  // --- toasts: auto-dismiss ~4s + hover pause
  await page.goto(BASE + "/dev/ui?state=toasts"); await page.waitForSelector(".toasts .toast");
  const t0 = Date.now();
  const n0 = await page.$$eval(".toasts .toast", (t) => t.length);
  check("toasts: max 3 visible (demo fires 4)", n0 === 3, `${n0}`);
  const texts = await page.$$eval(".toasts .toast", (t) => t.map((x) => x.className + " :: " + x.textContent?.trim()));
  note(`toasts shown: ${texts.join(" || ")}`);
  await page.waitForFunction(() => document.querySelectorAll(".toasts .toast").length === 0, null, { timeout: 8000 }).catch(() => {});
  const gone = Date.now() - t0;
  check("toasts: all auto-dismissed within ~4s (3.5–5.5s)", gone >= 3500 && gone <= 5500, `${gone}ms`);
  // hover pause
  await page.goto(BASE + "/dev/ui?state=toasts"); await page.waitForSelector(".toasts .toast");
  const first = await page.$(".toasts .toast");
  await first.hover();
  await sleep(5000);
  const stillThere = await page.$$eval(".toasts .toast", (t) => t.length);
  check("toasts: hover pauses auto-dismiss (hovered toast still visible after 5s)", stillThere >= 1, `${stillThere} left`);
  await page.mouse.move(5, 5);
  await page.waitForFunction(() => document.querySelectorAll(".toasts .toast").length === 0, null, { timeout: 6000 }).catch(() => {});
  check("toasts: resumes and dismisses after mouse leaves", (await page.$$eval(".toasts .toast", (t) => t.length)) === 0);
  // close ✕ works
  await page.goto(BASE + "/dev/ui?state=toasts"); await page.waitForSelector(".toasts .toast .x");
  const before = await page.$$eval(".toasts .toast", (t) => t.length);
  await page.click(".toasts .toast .x");
  const after = await page.$$eval(".toasts .toast", (t) => t.length);
  check("toasts: ✕ dismisses one toast", after === before - 1, `${before} → ${after}`);

  // --- dialogs: confirm + danger typed confirm + Esc
  await page.goto(BASE + "/dev/ui?state=dialog-danger"); await page.waitForSelector(".dlg .card2 input");
  const primary = ".dlg .card2 .acts button.btn.r";
  check("danger dialog: primary disabled + .dis before typing", (await page.isDisabled(primary)) && (await page.$(`${primary}.dis`)) !== null);
  await page.fill(".dlg .card2 input", "na");
  check("danger dialog: partial text keeps disabled", await page.isDisabled(primary));
  await page.fill(".dlg .card2 input", "khang");
  check("danger dialog: exact text enables primary", !(await page.isDisabled(primary)));
  await page.fill(".dlg .card2 input", "NAM");
  note(`danger dialog: 'NAM' (case differs) enables primary: ${!(await page.isDisabled(primary))}`);
  f = await focusInfo(page);
  note(`danger dialog: focused element on open = ${f?.tag} (${f?.name})`);
  await page.keyboard.press("Escape"); await sleep(300);
  check("danger dialog: Esc closes", !(await page.$(".dlg")));
  await page.goto(BASE + "/dev/ui?state=dialog-confirm"); await page.waitForSelector(".dlg .card2");
  const confirmBtns = await page.$$eval(".dlg .acts button", (b) => b.map((x) => x.textContent?.trim() + ":" + x.className));
  check("confirm dialog: buttons Huỷ (.btn) + Xoá (.btn.r), none disabled", confirmBtns.join("|") === "Huỷ:btn|Xoá:btn r", confirmBtns.join("|"));
  await page.keyboard.press("Escape"); await sleep(300);
  check("confirm dialog: Esc closes", !(await page.$(".dlg")));
  await page.goto(BASE + "/dev/ui?state=dialog-confirm"); await page.waitForSelector(".dlg .card2");
  await page.mouse.click(20, 500); await sleep(300);
  note(`confirm dialog: overlay click closes = ${!(await page.$(".dlg"))}`);

  // --- avatar menu
  await page.goto(BASE + "/"); await page.waitForLoadState("networkidle");
  await page.click("header .avatar");
  const menu = await page.waitForSelector(".menu2", { timeout: 3000 }).catch(() => null);
  const menuItems = menu ? await page.$$eval(".menu2 [role=menuitem]", (i) => i.map((x) => x.textContent?.trim())) : [];
  check("avatar menu (admin): Cài đặt / Quản trị / Đăng xuất", menuItems.join("|") === "Cài đặt|Quản trị|Đăng xuất", menuItems.join("|"));
  await page.keyboard.press("Escape");

  // --- 404 page as admin
  const r404 = await page.goto(BASE + "/khong-ton-tai");
  await page.waitForLoadState("networkidle");
  check("404: HTTP status 404", r404?.status() === 404, `${r404?.status()}`);
  const t404 = await page.textContent(".emptybox .emptytitle");
  check("404: 'Không tìm thấy phim' + header present + 'Về trang chủ' link", t404?.trim() === "Không tìm thấy phim" && Boolean(await page.$("header .logo")) && (await page.getAttribute(".emptybox a.btn", "href")) === "/", t404 || "");
  // 404 for unauthenticated → login redirect (middleware), note
  await page.screenshot({ path: path.join(SHOTS, "404-admin.png") });

  // --- invite flow keyboard-only as a fresh member
  await d.ctx.clearCookies();
  const inv = await d.seed({ fixture: "invite", state: "valid" });
  const token = inv.json.token;
  await page.goto(BASE + "/invite/" + token); await page.waitForLoadState("networkidle");
  f = await focusInfo(page);
  check("invite: display-name autofocused", f?.tag === "INPUT" && /Tên hiển thị/.test(f?.name || ""), JSON.stringify(f));
  const banner = await page.textContent(".form .inv");
  check("invite: banner '✓ Lời mời từ <inviter> · còn 7 ngày · dùng 1 lần' with bold name", /^✓ Lời mời từ .+ · còn 7 ngày · dùng 1 lần$/.test(banner?.trim() || "") && Boolean(await page.$(".form .inv b")), banner || "");
  await page.keyboard.type(MEMBER.name);
  await page.keyboard.press("Tab"); await page.keyboard.type(ADMIN.u);
  await page.waitForSelector(".form input.bad", { timeout: 4000 });
  const takenMsg = await page.textContent(".form .err");
  check("invite: taken username → .bad + 'Tên đăng nhập “u” đã có người dùng. Thử “u2” hoặc “…”.'", /^Tên đăng nhập “.+” đã có người dùng\. Thử “.+2” hoặc “.+”\.$/.test(takenMsg?.trim() || ""), (takenMsg || "").replace(ADMIN.u, "<admin>"));
  await page.keyboard.press("Control+A"); await page.keyboard.type(MEMBER.u);
  await page.waitForSelector(".form input.ok", { timeout: 4000 });
  const okMsg = await page.textContent(".form .err");
  check("invite: free username → .ok + '✓ Tên đăng nhập còn trống' (green)", okMsg?.trim() === "✓ Tên đăng nhập còn trống", okMsg || "");
  await page.keyboard.press("Tab"); await page.keyboard.type("abcabc");
  const weak = await page.$$eval(".form .err", (e) => e.map((x) => x.textContent?.trim()));
  check("invite: weak password → 'Độ mạnh: yếu'", weak.includes("Độ mạnh: yếu"), weak.join("|"));
  const meterColor = await page.$eval(".form .meter i", (i) => i.style.background || getComputedStyle(i).backgroundColor);
  check("invite: weak meter is red", /e50914|229, 9, 20/.test(meterColor), meterColor);
  await page.keyboard.press("Tab"); await page.keyboard.type("abcabcd");
  const mism = await page.$$eval(".form .err", (e) => e.map((x) => x.textContent?.trim()));
  check("invite: mismatch → 'Mật khẩu nhập lại không khớp'", mism.includes("Mật khẩu nhập lại không khớp"), mism.join("|"));
  f = await focusInfo(page);
  check("invite: keyboard focus ring visible on password2", f?.outlineStyle !== "none" && f?.outlineWidth !== "0px", `${f?.outlineStyle} ${f?.outlineWidth} ${f?.outlineColor}`);
  // submit with mismatch via Enter → should not submit
  await page.keyboard.press("Enter"); await sleep(500);
  check("invite: Enter with mismatch does not submit (still on invite page)", page.url().includes("/invite/"));
  // fix passwords, submit via Enter
  await page.fill('input[autocomplete="new-password"] >> nth=0', MEMBER.p);
  const strong = await page.$$eval(".form .err", (e) => e.map((x) => x.textContent?.trim()));
  note(`invite: strength label for '${MEMBER.p.replace(/./g, "*")}' = ${strong.find((s) => s?.startsWith("Độ mạnh"))}`);
  await page.fill('input[autocomplete="new-password"] >> nth=1', MEMBER.p);
  await page.focus('input[autocomplete="new-password"] >> nth=1');
  await page.keyboard.press("Enter");
  await page.waitForURL(BASE + "/", { timeout: 15000 }).catch(() => {});
  check("invite: Enter submits → redirected to /", page.url() === BASE + "/", page.url());

  // --- onboarding 3 steps persist settings
  await page.waitForSelector(".auth.gate .steps", { timeout: 10000 });
  const stepsOn = async () => page.$$eval(".auth.gate .steps i", (i) => i.filter((x) => x.classList.contains("on")).length);
  check("onboarding: gate shown, step 1/3", (await stepsOn()) === 1);
  const hello = await page.textContent(".auth.gate h2");
  check("onboarding: 'Chào Bảo 👋'", hello?.trim() === `Chào ${MEMBER.name} 👋`, hello || "");
  const tabbarUnderGate = await page.evaluate(() => { const t = document.querySelector(".tabbar"); return t ? getComputedStyle(t).display : "absent"; });
  note(`onboarding desktop: .tabbar display = ${tabbarUnderGate}`);
  await page.click(".auth.gate .opt span:nth-child(2)"); // 4K
  await page.click(".auth.gate button.btn.r"); // Tiếp
  await page.waitForFunction(() => document.querySelectorAll(".auth.gate .steps i.on").length === 2);
  await page.click(".auth.gate .opt span:nth-child(2)"); // English
  await page.uncheck(".auth.gate label input[type=checkbox]");
  await page.click(".auth.gate button.btn.r");
  await page.waitForFunction(() => document.querySelectorAll(".auth.gate .steps i.on").length === 3);
  const qr = await page.waitForSelector(".auth.gate .qr img", { timeout: 5000 }).catch(() => null);
  check("onboarding step 3: real QR image rendered", Boolean(qr));
  const btns3 = await page.$$eval(".auth.gate button.btn", (b) => b.map((x) => x.textContent?.trim()));
  check("onboarding step 3 buttons 'Để sau' + 'Vào xem phim'", btns3.join("|") === "Để sau|Vào xem phim", btns3.join("|"));
  await page.click(".auth.gate button.btn.r");
  await page.waitForSelector(".auth.gate", { state: "detached", timeout: 10000 });
  const me = await d.get("/api/me");
  check("onboarding: /api/me shows quality=2160p sub_lang=en auto_translate=false onboarded=true", me.json?.settings?.quality === "2160p" && me.json?.settings?.sub_lang === "en" && me.json?.settings?.auto_translate === false && me.json?.user?.onboarded === true, JSON.stringify({ s: me.json?.settings, o: me.json?.user?.onboarded }));
  await page.reload(); await page.waitForLoadState("networkidle");
  check("onboarding: gate does not reappear after reload", !(await page.$(".auth.gate")));

  // --- member on /admin → 403, /forbidden, member avatar menu
  const rAdmin = await page.goto(BASE + "/admin"); await page.waitForLoadState("networkidle");
  const t403 = await page.textContent(".emptybox .emptytitle");
  check("member /admin → 403 box 'Bạn không có quyền xem trang này' inside shell", t403?.trim() === "Bạn không có quyền xem trang này" && Boolean(await page.$("header .logo")), t403 || "");
  note(`member /admin HTTP status = ${rAdmin?.status()} (403 box rendered with 200?)`);
  await page.click("header .avatar");
  const memberMenu = await page.$$eval(".menu2 [role=menuitem]", (i) => i.map((x) => x.textContent?.trim()));
  check("avatar menu (member): no 'Quản trị'", memberMenu.join("|") === "Cài đặt|Đăng xuất", memberMenu.join("|"));
  await page.keyboard.press("Escape");
  // invite reused → used page
  await page.goto(BASE + "/invite/" + token); await page.waitForLoadState("networkidle");
  const usedTitle = await page.textContent(".form h2");
  const usedText = await page.textContent(".form p");
  check("reused invite → 'Link mời đã được dùng' naming qa_ux + dd/mm", usedTitle?.trim() === "Link mời đã được dùng" && /tạo tài khoản “qa_ux” vào \d\d\/\d\d\./.test(usedText || ""), usedText || "");
  // logout via menu
  await page.goto(BASE + "/"); await page.waitForLoadState("networkidle");
  await page.click("header .avatar");
  await page.click(".menu2 [role=menuitem]:has-text('Đăng xuất')");
  await page.waitForURL(/\/login/, { timeout: 10000 }).catch(() => {});
  check("logout from avatar menu → /login", page.url().includes("/login"), page.url());
  const afterLogout = await page.goto(BASE + "/"); await page.waitForLoadState("networkidle");
  check("after logout, / redirects to /login", page.url().includes("/login"), `${afterLogout?.status()} ${page.url()}`);

  // --- console errors (desktop) incl. invite broken states + forbidden
  await page.goto(BASE + "/invite/" + "x".repeat(32)); await page.waitForLoadState("networkidle");
  const exp = await d.seed({ fixture: "invite", state: "expired" });
  await page.goto(BASE + "/invite/" + exp.json.token); await page.waitForLoadState("networkidle");
  await d.login(ADMIN.u, ADMIN.p);
  for (const u of ["/forbidden", "/dev/ui?state=offline", "/dev/ui?state=kbd-help", "/dev/ui?state=403", "/dev/ui?state=404", "/admin"]) { await page.goto(BASE + u); await page.waitForLoadState("networkidle"); }
  await page.goto(BASE + "/dev/ui?state=offline");
  await d.post("/api/dev/scenario", { flags: ["offline"] });
  await page.reload(); await page.waitForLoadState("networkidle");
  const bannerTxt = await page.textContent(".banner.err").catch(() => null);
  check("offline scenario → sticky .banner.err with 'Thử lại'", bannerTxt?.includes("Mất kết nối mạng") && Boolean(await page.$(".banner.err button.btn.sm")), bannerTxt || "none");
  await d.post("/api/dev/scenario", { flags: [] });
  // real offline event
  await page.goto(BASE + "/"); await page.waitForLoadState("networkidle");
  await d.ctx.setOffline(true); await sleep(400);
  const offBanner = await page.$(".banner.err");
  await d.ctx.setOffline(false); await sleep(400);
  const backOnline = await page.$(".banner.err");
  check("navigator offline → banner; online → banner gone", Boolean(offBanner) && !backOnline);
  check("desktop: no console errors across pages", d.consoleErrors.length === 0, d.consoleErrors.join(" || ").slice(0, 1500));
  await d.ctx.close();

  // ------------------------------------------------------------------ mobile
  const m = await newCtx(browser, true);
  const mp = await m.ctx.newPage();
  await mp.goto(BASE + "/login"); await mp.waitForLoadState("networkidle");
  const tabOnLogin = await mp.evaluate(() => { const t = document.querySelector(".tabbar"); return t ? getComputedStyle(t).display : "absent"; });
  check("mobile: tab bar hidden on /login", tabOnLogin === "absent" || tabOnLogin === "none", tabOnLogin);
  await mp.goto(BASE + "/invite/" + "x".repeat(32)); await mp.waitForLoadState("networkidle");
  const tabOnInvite = await mp.evaluate(() => { const t = document.querySelector(".tabbar"); return t ? getComputedStyle(t).display : "absent"; });
  check("mobile: tab bar hidden on /invite/*", tabOnInvite === "absent" || tabOnInvite === "none", tabOnInvite);
  await m.login(ADMIN.u, ADMIN.p);
  await mp.goto(BASE + "/"); await mp.waitForLoadState("networkidle");
  const tabHome = await mp.evaluate(() => { const t = document.querySelector(".tabbar"); if (!t) return "absent"; const r = t.getBoundingClientRect(); return `${getComputedStyle(t).display} h=${r.height} bottom=${innerHeight - r.bottom}`; });
  check("mobile: tab bar visible on home, 64px, pinned to bottom", /^flex h=64 bottom=0$/.test(tabHome), tabHome);
  const tabs = await mp.$$eval(".tabbar div", (d) => d.map((x) => x.textContent?.trim() + (x.classList.contains("on") ? "*" : "")));
  check("mobile: tabs Trang chủ*/Tìm kiếm/Danh sách/Hồ sơ", tabs.join("|") === "Trang chủ*|Tìm kiếm|Danh sách|Hồ sơ", tabs.join("|"));
  const navHidden = await mp.evaluate(() => getComputedStyle(document.querySelector("header nav")).display);
  note(`mobile: header nav display = ${navHidden}`);
  const hdrH = await mp.evaluate(() => document.querySelector("header").getBoundingClientRect().height);
  check("mobile: header height 56px", hdrH === 56, `${hdrH}`);
  await mp.goto(BASE + "/dev/ui?state=toasts"); await mp.waitForSelector(".toasts .toast");
  const toastBottom = await mp.evaluate(() => { const t = document.querySelector(".toasts"); const r = t.getBoundingClientRect(); return innerHeight - r.bottom; });
  note(`mobile: toast stack bottom offset = ${toastBottom}px (tab bar 64px)`);
  await mp.goto(BASE + "/dev/ui?state=dialog-danger"); await mp.waitForSelector(".dlg .card2");
  const dlgBox = await mp.evaluate(() => { const c = document.querySelector(".dlg .card2").getBoundingClientRect(); return { w: Math.round(c.width), x: Math.round(c.x), bottom: Math.round(innerHeight - c.bottom), overflow: c.right > innerWidth }; });
  check("mobile: dialog fits viewport width", !dlgBox.overflow, JSON.stringify(dlgBox));
  note(`mobile: dialog geometry ${JSON.stringify(dlgBox)} (spec says bottom sheet ≤700px; dev says mockup CSS has none)`);
  check("mobile: no console errors", m.consoleErrors.length === 0, m.consoleErrors.join(" || ").slice(0, 1000));
  // cleanup BEFORE closing the context (its request client dies with it): drop the test member and the admin sessions we created
  await m.seed({ fixture: "delete-user", username: MEMBER.u }).catch(() => {});
  await m.ctx.request.delete(BASE + "/api/me/sessions?others=1").catch(() => {});
  await m.ctx.request.post(BASE + "/api/auth/logout").catch(() => {});
  await m.ctx.close();
  await stopSeeder();
  await browser.close();
  console.log(out.join("\n"));
  console.log(`\n${out.filter((l) => l.startsWith("PASS")).length} passed, ${fails} failed, ${out.filter((l) => l.startsWith("NOTE")).length} notes`);
  process.exit(fails ? 1 : 0);
}

main().catch((e) => { console.error(e); console.log(out.join("\n")); process.exit(2); });
