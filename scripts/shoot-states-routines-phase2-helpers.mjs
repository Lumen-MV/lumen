// Shared helpers for the Phase 2 screenshot routines (scripts/shoot-states-routines-phase2*.mjs).

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const isMobile = (c) => (c.page.viewportSize()?.width ?? 1440) <= 700;

/** Logs in as admin when needed; logout clears the cookie jar, so the state's scenario flags are re-applied afterwards. */
export async function asAdmin(c) {
  if (!c.fx.adminLoggedIn) {
    await c.api.logout();
    await c.api.login(c.api.admin.username, c.api.admin.password);
    c.fx.adminLoggedIn = true;
    if (c.entry.scenario) await c.api.scenario(c.entry.scenario);
  }
}

/** Full navigation + settle (default for most states). */
export async function open(c, url = c.url) {
  await asAdmin(c);
  await c.page.goto(url);
  await c.settle(c.page);
}

/** Navigate without waiting for the (deliberately slow) server render so the loading UI can be captured. */
export async function openPending(c, selector) {
  await asAdmin(c);
  await c.page.goto(c.url, { waitUntil: "commit" });
  await c.page.waitForSelector(selector, { timeout: 15000 });
  await sleep(300);
  c.afterShot = () => c.page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
}

/** Hold matching API responses for `holdMs` (then let them through) so client loading states stay visible. */
export const hold = (page, pattern, holdMs) =>
  page.route(pattern, async (route) => {
    await sleep(holdMs);
    await route.continue().catch(() => {});
  });

export async function openSearch(c, text) {
  await open(c);
  await c.page.keyboard.press("/");
  await c.page.waitForSelector(".sov input");
  if (text) await c.page.fill(".sov input", text);
}

export async function scrollToBottom(page) {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
}
