// Per-state interactions for scripts/shoot-states.mjs. Each routine leaves the page in the state to screenshot.
// Routines run in manifest order inside ONE browser context, so later states may rely on earlier ones
// (e.g. invite-loading really creates member "bao" and logs in → onboard-1..3 → 403 → invite-used).

const FORM = ".form";
const BTN = `${FORM} button.btn.r`;

const loginPage = async ({ page, api, url, settle }) => {
  await api.logout();
  try {
    await page.goto(url);
  } catch (err) {
    if (!/ERR_ABORTED/.test(String(err))) throw err; // a previous in-page fetch settling can abort the first try
    await page.goto(url);
  }
  await settle(page);
};

const fillLogin = async (page, user, pass) => {
  await page.fill('input[name="username"]', user);
  await page.fill('input[name="password"]', pass);
};

/** Holds the matching API call for `holdMs`, then aborts it (so no session is created). */
const holdThenAbort = (page, pattern, holdMs) =>
  page.route(pattern, async (route) => {
    await new Promise((r) => setTimeout(r, holdMs));
    await route.abort("failed").catch(() => {});
  });

export const ROUTINES = {
  // ---------- login ----------
  login: loginPage,
  "login-filled": async (c) => {
    await loginPage(c);
    await fillLogin(c.page, c.api.admin.username, c.api.admin.password);
  },
  "login-loading": async (c) => {
    await loginPage(c);
    await holdThenAbort(c.page, "**/api/auth/login", 2500);
    await fillLogin(c.page, c.api.admin.username, c.api.admin.password);
    await c.page.click(BTN);
    await c.page.waitForSelector(`${BTN}.load`);
    await c.api.sleep(300);
  },
  "login-wrong": async (c) => {
    await loginPage(c);
    await fillLogin(c.page, c.api.admin.username, "sai-mat-khau");
    await c.page.click(BTN);
    await c.page.waitForSelector(`${FORM} input.bad`);
    await c.api.sleep(500); // let the shake finish
  },
  "login-locked": async (c) => {
    await loginPage(c);
    await fillLogin(c.page, "khang", "KhangPass123");
    await c.page.click(BTN);
    await c.page.waitForSelector(`${FORM} input.bad`);
    await c.api.sleep(500);
  },
  "login-rate": async (c) => {
    for (let i = 0; i < 4; i++) await c.api.loginFail(c.api.admin.username, `wrong-${i}`);
    await loginPage(c);
    await fillLogin(c.page, c.api.admin.username, "wrong-5");
    await c.page.click(BTN);
    await c.page.waitForSelector(`${BTN}.dis`);
    await c.api.seed({ fixture: "reset-rate-limit" });
  },
  "login-offline": async (c) => {
    await loginPage(c);
    await c.page.route("**/api/auth/login", (route) => route.abort("failed"));
    await fillLogin(c.page, c.api.admin.username, c.api.admin.password);
    await c.page.click(BTN);
    await c.page.waitForSelector(".toast.err");
  },
  // ---------- invite ----------
  invite: loginPage,
  "invite-filled": async (c) => {
    await loginPage(c);
    const m = c.api.member;
    await c.page.fill(`${FORM} input[autocomplete="nickname"]`, m.displayName);
    await c.page.fill(`${FORM} input[autocomplete="username"]`, m.username);
    await c.page.fill(`${FORM} input[autocomplete="new-password"] >> nth=0`, m.password);
    await c.page.fill(`${FORM} input[autocomplete="new-password"] >> nth=1`, m.password);
    await c.page.waitForSelector(`${FORM} input.ok`);
  },
  "invite-taken": async (c) => {
    await loginPage(c);
    await c.page.fill(`${FORM} input[autocomplete="nickname"]`, c.api.member.displayName);
    await c.page.fill(`${FORM} input[autocomplete="username"]`, "owner");
    await c.page.waitForSelector(`${FORM} input.bad`);
  },
  "invite-weak": async (c) => {
    await loginPage(c);
    const m = c.api.member;
    await c.page.fill(`${FORM} input[autocomplete="nickname"]`, m.displayName);
    await c.page.fill(`${FORM} input[autocomplete="username"]`, m.username);
    await c.page.fill(`${FORM} input[autocomplete="new-password"] >> nth=0`, "abcabc");
    await c.page.fill(`${FORM} input[autocomplete="new-password"] >> nth=1`, "abcabcd");
    await c.page.waitForSelector(`${FORM} input.ok`);
    await c.page.waitForSelector(`${FORM} input.bad`);
  },
  "invite-loading": async (c) => {
    await ROUTINES["invite-filled"](c);
    await c.page.route("**/api/auth/accept-invite", async (route) => {
      await c.api.sleep(2500);
      await route.continue();
    });
    await c.page.click(BTN);
    await c.page.waitForSelector(`${BTN}.load`);
    await c.api.sleep(300);
    // after the screenshot the request completes → member "bao" exists and is logged in
    c.afterShot = () => c.page.waitForURL(`${c.api.base}/`, { timeout: 15000 });
  },
  // ---------- onboarding (logged in as bao after invite-loading; --only runs seed the member instead) ----------
  "onboard-1": async (c) => {
    await c.page.waitForURL(`${c.api.base}/`, { timeout: 15000 }).catch(() => {});
    await c.page.goto(c.url);
    await c.settle(c.page);
    if (!(await c.page.$(".auth.gate .steps"))) {
      await ensureMember(c, false);
      await c.page.goto(c.url);
      await c.settle(c.page);
    }
    await c.page.waitForSelector(".auth.gate .steps");
  },
  "onboard-2": async (c) => {
    if (!(await c.page.$(".auth.gate .steps"))) await ROUTINES["onboard-1"](c);
    await c.page.click(".auth.gate button.btn.r");
    await c.page.waitForSelector(".auth.gate .steps i:nth-child(2).on");
  },
  "onboard-3": async (c) => {
    if (!(await c.page.$(".auth.gate .steps i:nth-child(2).on"))) await ROUTINES["onboard-2"](c);
    await c.page.click(".auth.gate button.btn.r");
    await c.page.waitForSelector(".auth.gate .qr img");
  },
  // ---------- member hits /admin ----------
  403: async (c) => {
    if (await c.page.$(".auth.gate")) {
      await c.page.click(".auth.gate button.btn.r"); // "Vào xem phim"
      await c.page.waitForSelector(".auth.gate", { state: "detached" });
    }
    await c.page.goto(c.url);
    await c.settle(c.page);
    if (!(await c.page.$(".emptybox"))) {
      await ensureMember(c, true); // --only run: not logged in as a member yet
      await c.page.goto(c.url);
      await c.settle(c.page);
    }
    await c.page.waitForSelector(".emptybox");
  },
  "invite-used": loginPage,
  "invite-expired": loginPage,
  "invite-invalid": loginPage,
  // ---------- global (admin) ----------
  buttons: adminPage,
  toasts: async (c) => {
    await adminPage(c);
    await c.page.waitForSelector(".toasts .toast >> nth=2");
  },
  "dialog-confirm": async (c) => {
    await adminPage(c);
    await c.page.waitForSelector(".dlg .card2");
  },
  "dialog-danger": async (c) => {
    await adminPage(c);
    await c.page.waitForSelector(".dlg .card2 input");
  },
  offline: async (c) => {
    await adminPage(c);
    await c.page.waitForSelector(".banner.err");
  },
  "kbd-help": async (c) => {
    await adminPage(c);
    await c.page.waitForSelector(".dlg .kbd");
  },
  404: async (c) => {
    await adminPage(c);
    await c.page.waitForSelector(".emptybox");
  },
};

/** Seeds member "bao" (onboarded or not) and logs the context in as them. */
async function ensureMember(c, onboarded) {
  const m = c.api.member;
  await c.api.seed({ fixture: "user", username: m.username, displayName: m.displayName, password: m.password, onboarded });
  await c.api.logout();
  await c.api.login(m.username, m.password);
  c.fx.adminLoggedIn = false;
}

async function adminPage(c) {
  if (!c.fx.adminLoggedIn) {
    await c.api.logout();
    await c.api.login(c.api.admin.username, c.api.admin.password);
    c.fx.adminLoggedIn = true;
  }
  await c.page.goto(c.url);
  await c.settle(c.page);
}
