// Mobile regression: poster rows and the Top 10 row must scroll horizontally by touch on phones.
// Usage: BASE=http://localhost:3000 node tests/qa-ux-mobile-row-swipe.mjs   (dev server with LUMEN_SCENARIOS=1)
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, devices } from "@playwright/test";
import { adminCreds, readEnv } from "./qa-shared-helpers.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ADMIN = adminCreds(readEnv(ROOT));
const BASE = process.env.BASE || "http://localhost:3000";
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices["iPhone 13"], baseURL: BASE });
const page = await ctx.newPage();
let pass = 0, fail = 0;
const check = (name, ok, info = "") => { if (ok) pass++; else fail++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${info ? " — " + info : ""}`); };

const login = await ctx.request.post(BASE + "/api/auth/login", { data: { username: ADMIN.u, password: ADMIN.p, remember: true } });
check("login", login.ok());
await page.goto("/", { waitUntil: "networkidle" });
await page.waitForSelector(".row .card, .top10 .t10", { timeout: 30000 });

for (const sel of [".row", ".top10"]) {
  const loc = page.locator(sel).first();
  await loc.scrollIntoViewIfNeeded();
  const before = await loc.evaluate((el) => ({ scrollable: el.scrollWidth > el.clientWidth + 8, overflowX: getComputedStyle(el).overflowX, left: el.scrollLeft }));
  check(`${sel} is horizontally scrollable on phone`, before.scrollable && ["auto", "scroll"].includes(before.overflowX), JSON.stringify(before));
  const box = await loc.boundingBox();
  // native touch swipe from right to left inside the row
  const y = box.y + box.height / 2;
  await page.touchscreen.tap(box.x + box.width - 40, y).catch(() => {});
  await page.mouse.move(box.x + box.width - 40, y);
  await loc.evaluate((el) => { el.scrollBy({ left: 240, behavior: "instant" }); });
  await page.waitForTimeout(200);
  const after = await loc.evaluate((el) => el.scrollLeft);
  check(`${sel} scrollLeft moved`, after > before.left + 100, `scrollLeft=${after}`);
  // scrolling must not reveal the desktop hover padding (no vertical scroll area inside the row)
  const vertical = await loc.evaluate((el) => el.scrollHeight - el.clientHeight);
  check(`${sel} has no inner vertical scroll area`, vertical <= 40, `delta=${vertical}`);
}
// real touch gesture through CDP on the first row
const row = page.locator(".row").first();
await row.evaluate((el) => el.scrollTo({ left: 0, behavior: "instant" }));
const b = await row.boundingBox();
const cdp = await ctx.newCDPSession(page);
const y = b.y + b.height / 2;
await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: b.x + 300, y }] });
for (let i = 1; i <= 8; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: b.x + 300 - i * 30, y }] });
await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
await page.waitForTimeout(400);
const swiped = await row.evaluate((el) => el.scrollLeft);
check("touch swipe gesture scrolls the row", swiped > 60, `scrollLeft=${swiped}`);

await browser.close();
console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
