// Collects console warnings/errors (all levels except log/info) on the Phase 1 pages as admin.
//   node tests/qa-console-warnings-probe.mjs   (dev server on :3000, LUMEN_SCENARIOS=1)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = "http://localhost:3000";
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const msgs = [];
page.on("console", (m) => { if (!["log", "info", "debug"].includes(m.type()) && !/Failed to load resource/.test(m.text())) msgs.push(`[${m.type()}] ${page.url().replace(BASE, "")} :: ${m.text().slice(0, 300)}`); });
page.on("pageerror", (e) => msgs.push(`[pageerror] ${page.url().replace(BASE, "")} :: ${String(e).slice(0, 300)}`));
await page.goto(BASE + "/login"); await page.waitForLoadState("networkidle");
await page.fill('input[name="username"]', env.ADMIN_USERNAME); await page.fill('input[name="password"]', env.ADMIN_PASSWORD);
await page.click(".form button.btn.r"); await page.waitForURL(BASE + "/", { timeout: 15000 });
for (const u of ["/", "/dev/ui?state=buttons", "/dev/ui?state=toasts", "/dev/ui?state=dialog-confirm", "/dev/ui?state=dialog-danger", "/dev/ui?state=kbd-help", "/dev/ui?state=offline", "/forbidden", "/admin", "/khong-ton-tai", "/invite/" + "x".repeat(32)]) {
  await page.goto(BASE + u); await page.waitForLoadState("networkidle").catch(() => {}); await page.waitForTimeout(400);
}
await page.goto(BASE + "/"); await page.click("header .avatar"); await page.waitForTimeout(300); await page.keyboard.press("Escape");
await page.keyboard.press("Shift+?"); await page.waitForTimeout(300); await page.keyboard.press("Escape");
await ctx.request.post(BASE + "/api/auth/logout");
await browser.close();
console.log(msgs.length ? msgs.join("\n") : "no console warnings/errors");
