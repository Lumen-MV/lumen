// Shared by the Phase 6 UX scripts: navigation with a network-idle settle and a text-list reader.
export const BASE = process.argv.includes("--base") ? process.argv[process.argv.indexOf("--base") + 1] : "http://localhost:3000";
export const goto = async (page, p) => { await page.goto(BASE + p); await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {}); };
export const texts = (page, sel) => page.$$eval(sel, (els) => els.map((e) => e.textContent?.trim() ?? ""));
