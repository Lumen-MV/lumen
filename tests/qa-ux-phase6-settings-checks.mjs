// Phase 6 UX: the five settings sections (profile save → "Đã lưu ✓", swatches recolour the header avatar, password error
// states, playback / subtitles toggles persist across reload, TV QR + copy + download + revoke → revoked → new link, sessions
// per-device / all-others logout). Called by qa-ux-phase6-playwright.mjs with the run's `check`.
import { sleep } from "./qa-shared-helpers.mjs";
import { goto, texts } from "./qa-ux-phase6-helpers.mjs";

export async function settingsChecks(page, check) {
  await goto(page, "/settings?tab=profile");
  check("settings: left nav (5 items, Hồ sơ on), Hồ sơ + Đổi mật khẩu sections, 8 swatches", (await texts(page, ".set nav2 a")).join("|") === "Hồ sơ|Phát|Phụ đề|Thiết bị & TV|Phiên đăng nhập" && (await page.textContent(".set nav2 a.on")) === "Hồ sơ" && (await texts(page, ".set .sec h2")).join("|") === "Hồ sơ|Đổi mật khẩu" && (await page.$$(".swatch i")).length === 8 && (await page.$$(".swatch i.on")).length === 1);
  const original = await page.inputValue('[data-field="display-name"] input');
  await page.fill('[data-field="display-name"] input', "Anh QA");
  await page.click('[data-field="display-name"] button');
  await page.waitForSelector(".saved");
  check("profile: Lưu → 'Đã lưu ✓' appears, header avatar initial follows, hides after ~2 s", (await page.textContent(".saved")) === "Đã lưu ✓" && (await page.waitForFunction(() => document.querySelector("header .avatar")?.textContent === "A").then(() => true)));
  await sleep(2300);
  check("profile: saved flash gone after 2 s", (await page.$(".saved")) === null);
  await page.fill('[data-field="display-name"] input', original);
  await page.click('[data-field="display-name"] button');
  await page.waitForSelector(".saved");
  await page.click('.swatch i[data-color="#46d369"]');
  await page.waitForFunction(() => getComputedStyle(document.querySelector("header .avatar")).backgroundColor === "rgb(70, 211, 105)");
  check("profile: picking a swatch marks it .on and recolours the header avatar", (await page.getAttribute('.swatch i[data-color="#46d369"]', "class")) === "on");
  await page.click('.swatch i[data-color="#2d6cdf"]');
  await page.waitForFunction(() => getComputedStyle(document.querySelector("header .avatar")).backgroundColor === "rgb(45, 108, 223)");
  // password errors
  const pw = '[data-form="password"]';
  await page.fill(`${pw} input[autocomplete="current-password"]`, "wrong-pass");
  await page.fill(`${pw} input[autocomplete="new-password"] >> nth=0`, "abc");
  await page.fill(`${pw} input[autocomplete="new-password"] >> nth=1`, "abc");
  await page.click(`${pw} button[type="submit"]`);
  await page.waitForSelector('[data-pw-error="short"]');
  check("password: too short → 'Mật khẩu mới tối thiểu 8 ký tự.'", (await page.textContent('[data-pw-error="short"]')) === "Mật khẩu mới tối thiểu 8 ký tự.");
  await page.fill(`${pw} input[autocomplete="new-password"] >> nth=0`, "MatKhauMoi123");
  await page.fill(`${pw} input[autocomplete="new-password"] >> nth=1`, "MatKhauMoi124");
  await page.click(`${pw} button[type="submit"]`);
  await page.waitForSelector('[data-pw-error="mismatch"]');
  check("password: mismatch → 'Mật khẩu nhập lại không khớp.'", (await page.textContent('[data-pw-error="mismatch"]')) === "Mật khẩu nhập lại không khớp.");
  await page.fill(`${pw} input[autocomplete="new-password"] >> nth=1`, "MatKhauMoi123");
  await page.click(`${pw} button[type="submit"]`);
  await page.waitForSelector('[data-pw-error="wrong"]');
  check("password: wrong current → red outline + 'Mật khẩu hiện tại không đúng.'", (await page.textContent('[data-pw-error="wrong"]')) === "Mật khẩu hiện tại không đúng." && (await page.$eval(`${pw} input[autocomplete="current-password"]`, (el) => getComputedStyle(el).outlineColor)) === "rgb(229, 9, 20)");
  // playback persists
  await goto(page, "/settings?tab=playback");
  const before = await page.getAttribute('[data-settings="playback"] .fld:nth-of-type(2) .sw', "aria-checked");
  await page.click('[data-settings="playback"] .fld:nth-of-type(2) .sw');
  await sleep(500);
  await page.reload();
  await page.waitForSelector('[data-settings="playback"] .sw');
  const after = await page.getAttribute('[data-settings="playback"] .fld:nth-of-type(2) .sw', "aria-checked");
  check("playback: 'Ưu tiên bản nhỏ' toggle persists across reload", before !== after);
  await page.click('[data-settings="playback"] .fld:nth-of-type(2) .sw');
  await page.focus('[data-settings="playback"] .seg span.on');
  await page.keyboard.press("Tab");
  check("playback: quality seg is a single tab stop (Tab leaves the radio group for the next control; arrows move inside)", await page.evaluate(() => document.activeElement?.closest(".seg") === null && document.activeElement !== document.body));
  await goto(page, "/settings?tab=subtitles");
  check("subtitles: lang/size segs, auto-AI switch, sources line, quota mini bar 'N/20', AI month text", (await page.$$('[data-settings="subtitles"] .seg')).length === 2 && (await page.$('[data-settings="subtitles"] .sw')) !== null && (await page.textContent('[data-settings="subtitles"]')).includes("OpenSubtitles · SubDL · phụ đề nhúng") && /\d+\/20/.test(await page.textContent("[data-quota]")) && /phim · .*đ$/.test(await page.textContent("[data-ai-month]")));
  const aiBefore = await page.getAttribute('[data-settings="subtitles"] .sw', "aria-checked");
  await page.click('[data-settings="subtitles"] .sw');
  await sleep(400);
  await page.reload();
  await page.waitForSelector('[data-settings="subtitles"] .sw');
  check("subtitles: auto_translate toggle persists", (await page.getAttribute('[data-settings="subtitles"] .sw', "aria-checked")) !== aiBefore);
  await page.click('[data-settings="subtitles"] .sw');
  // TV
  await goto(page, "/settings?tab=tv");
  await page.waitForSelector('.tvbox[data-token="active"] .qr img');
  const qrBox = await page.$eval(".tvbox .qr", (el) => ({ w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height, img: el.querySelector("img")?.naturalWidth ?? 0, border: getComputedStyle(el).borderTopWidth, margin: getComputedStyle(el).marginTop }));
  check("tv: QR renders (150px box, 6px border, no margin), 3 steps, masked manifest URL, 3 buttons", qrBox.w === 150 && qrBox.h === 150 && qrBox.img > 0 && qrBox.border === "6px" && qrBox.margin === "0px" && (await page.$$(".steps3 li")).length === 3 && /\/stremio\/.{4}…..\/manifest\.json$/.test(await page.textContent("[data-manifest]")) && (await texts(page, ".tvbox button")).join("|") === "Sao chép link|Tải mã QR|Thu hồi link", JSON.stringify(qrBox) + " " + (await texts(page, ".tvbox button")).join("|"));
  await page.click(".tvbox button.w");
  await page.waitForSelector(".toast");
  const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => "");
  check("tv: 'Sao chép link' copies the full manifest URL + toast", /\/stremio\/[A-Za-z0-9_-]{32}\/manifest\.json$/.test(clip) && /Đã sao chép link addon/.test(await page.textContent(".toast")));
  const [download] = await Promise.all([page.waitForEvent("download"), page.click(".tvbox button:nth-of-type(2)")]);
  check("tv: 'Tải mã QR' downloads lumen-stremio-qr.png", download.suggestedFilename() === "lumen-stremio-qr.png");
  await page.click(".tvbox button:nth-of-type(3)");
  await page.waitForSelector(".dlg .card2");
  check("tv: 'Thu hồi link' opens the confirm dialog; Esc closes it", (await page.textContent(".dlg h3")) === "Thu hồi link Stremio?" && (await texts(page, ".dlg .acts button")).join("|") === "Huỷ|Thu hồi");
  await page.keyboard.press("Escape");
  await page.waitForSelector(".dlg", { state: "detached" });
  await page.click(".tvbox button:nth-of-type(3)");
  await page.click(".dlg .acts button.btn.r");
  await page.waitForSelector('.tvbox[data-token="revoked"]');
  check("tv: confirmed revoke → '— đã thu hồi, bấm Tạo link mới —', copy/download disabled, 'Tạo link mới' button, QR box blank", (await page.textContent("[data-manifest]")) === "— đã thu hồi, bấm Tạo link mới —" && (await page.$(".tvbox button.w.dis")) !== null && (await texts(page, ".tvbox button")).pop() === "Tạo link mới" && (await page.$(".tvbox .qr img")) === null);
  await page.click(".tvbox button:nth-of-type(3)");
  await page.waitForSelector('.tvbox[data-token="active"] .qr img');
  check("tv: 'Tạo link mới' → a different masked URL, QR back", (await page.textContent("[data-manifest]")) !== "— đã thu hồi, bấm Tạo link mới —");
  await page.click('[data-settings="tv"] .fld button');
  await page.waitForSelector(".dlg .card2");
  check("tv: 'Xem hướng dẫn' opens the iPhone guide dialog", (await page.textContent(".dlg h3")) === "iPhone / iPad");
  await page.keyboard.press("Escape");
  // sessions
  await goto(page, "/settings?tab=sessions");
  await page.waitForSelector(".dev[data-current]");
  const rowsBefore = (await page.$$(".dev")).length;
  check("sessions: current row says 'Thiết bị này · đang hoạt động' + 'Hiện tại'; fixture rows have 'Đăng xuất thiết bị này'; Stremio row 'qua link addon'", (await page.textContent(".dev[data-current] small")) === "Thiết bị này · đang hoạt động" && (await page.textContent(".dev[data-current] span")) === "Hiện tại" && (await page.$(".dev:not([data-current]) button")) !== null && /qua link addon/.test(await page.textContent(".dev[data-session='stremio'] small")));
  await page.click(".dev[data-session='session']:not([data-current]) button");
  await page.waitForFunction((n) => document.querySelectorAll(".dev").length === n - 1, rowsBefore);
  check("sessions: per-device logout removes the row", (await page.$$(".dev")).length === rowsBefore - 1);
  await page.click('[data-settings="sessions"] .sec > div:last-child button');
  await page.waitForFunction(() => document.querySelectorAll(".dev[data-session='session']").length === 1);
  check("sessions: 'Đăng xuất tất cả thiết bị khác' keeps only this device (+ Stremio), and this session still works", (await page.$$(".dev[data-session='session']")).length === 1 && (await page.evaluate(() => fetch("/api/me").then((r) => r.status))) === 200);
}

