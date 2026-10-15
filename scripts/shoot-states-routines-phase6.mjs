// Phase 6 (settings / admin / mobile composite) routines for scripts/shoot-states.mjs, keyed `page:state`. Settings
// states run as the admin on /settings?tab=…; admin states on /admin* with the `admin-data` fixture (members, sessions,
// invites, fake-TorBox cloud jobs, activity — no real download / provider call); `forbidden` logs in as member "bao".
// `mobile-frame:default` composes three 390×844 screenshots (home, detail + picker, player + popover) like mobile-frame.html.
import { asAdmin, open, sleep } from "./shoot-states-routines-phase2-helpers.mjs";
import { composeMobileFrame } from "./shoot-mobile-frame-composite.mjs";

const MORE = (u) => `[data-more="${u}"]`;
const MENU_ITEM = (label) => `.menu2 [role="menuitem"]:has-text("${label}")`;

export const SETUPS = {
  "admin-data": (api) => api.seed({ fixture: "admin-data" }),
  "os-quota:19": (api) => api.seed({ fixture: "os-quota", remaining: 19, resetInHours: 22 }),
  "clear-admin-data": (api) => api.seed({ fixture: "clear-admin-data" }),
  "clear-notifications": (api) => api.seed({ fixture: "clear-notifications" }),
  /** makes sure the admin has a live Stremio link (GET creates one when none existed; a revoked one is rotated) */
  "device-token:active": async (api) => {
    const t = await api.get("/api/me/device-token");
    if (t.revoked) await api.post("/api/me/device-token");
  },
};

async function settings(c, selector = ".set .sec") {
  await open(c);
  await c.page.waitForSelector(selector);
}
async function users(c) {
  await open(c);
  await c.page.waitForSelector("table[data-members] tr[data-member]");
}
async function openMenu(c, username) {
  await users(c);
  await c.page.click(MORE(username));
  await c.page.waitForSelector(".menu2 [role='menuitem']");
}
async function menuAction(c, username, label, waitFor) {
  await openMenu(c, username);
  await c.page.click(MENU_ITEM(label));
  await c.page.waitForSelector(waitFor);
}
async function createInviteDialog(c) {
  await users(c);
  await c.page.click(".h button.btn.r");
  await c.page.waitForSelector(".dlg .card2 input");
  await c.page.fill(".dlg .card2 input", "Mời Đạt");
}

export const ROUTINES = {
  // ---------- settings ----------
  "settings:profile": (c) => settings(c, '[data-field="display-name"]'),
  "settings:profile-saved": async (c) => {
    await settings(c, '[data-field="display-name"]');
    await c.page.click('[data-field="display-name"] button');
    await c.page.waitForSelector(".saved");
  },
  "settings:password-error": async (c) => {
    await settings(c, '[data-form="password"]');
    await c.page.fill('[data-form="password"] input[autocomplete="current-password"]', "sai-mat-khau");
    await c.page.fill('[data-form="password"] input[autocomplete="new-password"] >> nth=0', "MatKhauMoi123");
    await c.page.fill('[data-form="password"] input[autocomplete="new-password"] >> nth=1', "MatKhauMoi123");
    await c.page.click('[data-form="password"] button[type="submit"]');
    await c.page.waitForSelector('[data-pw-error="wrong"]');
  },
  "settings:playback": (c) => settings(c, '[data-settings="playback"] .seg'),
  "settings:subtitles": (c) => settings(c, "[data-ai-month]"),
  "settings:tv": async (c) => {
    await settings(c, '.tvbox[data-token="active"] .qr img');
    await sleep(200);
  },
  "settings:tv-revoke": async (c) => {
    await settings(c, '.tvbox[data-token="active"] .qr img');
    await c.page.click(".tvbox button.btn.sm:nth-of-type(3)");
    await c.page.waitForSelector(".dlg .card2");
  },
  "settings:tv-revoked": async (c) => {
    await settings(c, '.tvbox[data-token="active"] .qr img');
    await c.page.click(".tvbox button.btn.sm:nth-of-type(3)");
    await c.page.click(".dlg .card2 .acts button.btn.r");
    await c.page.waitForSelector('.tvbox[data-token="revoked"]');
    // a later state (sessions, onboarding QR, Stremio QA) wants a live link again
    c.cleanup = () => c.page.request.post(`${c.api.base}/api/me/device-token`);
  },
  "settings:sessions": (c) => settings(c, ".dev[data-session='stremio']"),
  // ---------- admin ----------
  "admin:dashboard": async (c) => {
    await open(c);
    await c.page.waitForSelector(".kpis .kpi:nth-child(6)");
    await c.page.waitForSelector("[data-watching-now]");
  },
  "admin:users": users,
  "admin:invite-create": createInviteDialog,
  "admin:invite-result": async (c) => {
    await createInviteDialog(c);
    await c.page.click(".dlg .card2 .acts button.btn.r");
    await c.page.waitForSelector(".dlg .qrbig img");
  },
  "admin:reset-password": (c) => menuAction(c, "quang", "Đặt lại mật khẩu", "[data-temp-password]"),
  "admin:lock-confirm": (c) => menuAction(c, "quang", "Khoá tài khoản", ".dlg .card2 button.btn.r"),
  "admin:delete-confirm": (c) => menuAction(c, "khang", "Xoá thành viên", ".dlg .card2 input"),
  "admin:user-menu": (c) => openMenu(c, "quang"),
  "admin:queue": async (c) => {
    await open(c);
    await c.page.waitForSelector("table[data-queue] tr[data-job]");
    await c.page.waitForSelector("table[data-done-today]");
  },
  "admin:queue-empty": async (c) => {
    await open(c);
    await c.page.waitForSelector(".emptybox");
  },
  "admin:activity": async (c) => {
    await open(c);
    await c.page.waitForSelector("[data-activity] div[data-kind]");
  },
  "admin:forbidden": async (c) => {
    const m = c.api.member;
    await c.api.seed({ fixture: "user", username: m.username, displayName: m.displayName, password: m.password, onboarded: true });
    await c.api.logout();
    await c.api.login(m.username, m.password);
    c.fx.adminLoggedIn = false;
    await c.page.goto(c.url);
    await c.settle(c.page);
    await c.page.waitForSelector(".emptybox");
  },
  // ---------- iPhone composite ----------
  "mobile-frame:default": async (c) => {
    await asAdmin(c);
    await c.page.goto(`${c.api.base}/`);
    await c.settle(c.page);
    const out = `${c.entry.page}-${c.entry.state}`;
    c.afterShot = () => composeMobileFrame(c, out);
  },
};
