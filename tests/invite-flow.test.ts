import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** Integration: real SQLite in a temp dir → seed admin → create invite → validate → accept → used. */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lumen-test-"));
process.env.DATA_DIR = tmp;
process.env.SESSION_SECRET = "test-secret-test-secret-test-secret-1234";
process.env.ADMIN_USERNAME = "owner";
process.env.ADMIN_PASSWORD = "admin-pass-123";
process.env.ADMIN_DISPLAY_NAME = "Admin";
process.env.APP_URL = "http://localhost:3000";

type Mods = {
  users: typeof import("@/lib/users/user-service");
  invites: typeof import("@/lib/invites/invite-service");
  accept: typeof import("@/lib/invites/accept-invite");
  settings: typeof import("@/lib/users/user-settings");
  device: typeof import("@/lib/auth/device-token");
};
let m: Mods;

beforeAll(async () => {
  m = { users: await import("@/lib/users/user-service"), invites: await import("@/lib/invites/invite-service"), accept: await import("@/lib/invites/accept-invite"), settings: await import("@/lib/users/user-settings"), device: await import("@/lib/auth/device-token") };
});

afterAll(async () => {
  (await import("@/lib/db/sqlite-client")).closeDb();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("invite flow (sqlite)", () => {
  it("seeds the admin idempotently", async () => {
    expect((await m.users.seedAdminFromEnv()).created).toBe(true);
    expect((await m.users.seedAdminFromEnv()).created).toBe(false);
    expect(m.users.findUserByUsername("owner")?.role).toBe("admin");
  });

  it("creates → validates → accepts → marks used; rejects reuse and taken names", async () => {
    const admin = m.users.findUserByUsername("owner")!;
    const inv = m.invites.createInvite({ createdBy: admin.id, expiresDays: 7 });
    expect(inv.url).toBe(`http://localhost:3000/invite/${inv.token}`);
    expect(m.invites.validateInvite(inv.token)).toEqual({ state: "valid", inviterName: "Admin", daysLeft: 7 });
    expect(m.invites.validateInvite("nope")).toEqual({ state: "invalid" });

    await expect(m.accept.acceptInvite({ token: inv.token, displayName: "X", username: "owner", password: "Bao123456" })).rejects.toMatchObject({ status: 409, code: "USERNAME_TAKEN" });
    await expect(m.accept.acceptInvite({ token: inv.token, displayName: "X", username: "bao", password: "short" })).rejects.toMatchObject({ status: 400, code: "WEAK_PASSWORD" });
    await expect(m.accept.acceptInvite({ token: inv.token, displayName: "X", username: "Bad Name", password: "Bao123456" })).rejects.toMatchObject({ status: 400, code: "BAD_USERNAME" });

    const user = await m.accept.acceptInvite({ token: inv.token, displayName: "Bảo", username: "bao", password: "Bao123456" });
    expect(user.role).toBe("member");
    expect(user.onboarded).toBe(false);
    expect(await m.users.verifyPassword("Bao123456", user.passwordHash)).toBe(true);

    const v = m.invites.validateInvite(inv.token);
    expect(v.state).toBe("used");
    if (v.state === "used") expect(v.usedBy).toBe("bao");
    await expect(m.accept.acceptInvite({ token: inv.token, displayName: "Y", username: "khang", password: "Bao123456" })).rejects.toMatchObject({ status: 410, code: "INVITE_USED" });
  });

  it("consumes a single-use invite exactly once under concurrent accepts", async () => {
    const admin = m.users.findUserByUsername("owner")!;
    const inv = m.invites.createInvite({ createdBy: admin.id, expiresDays: 7 });
    const attempt = (username: string) => m.accept.acceptInvite({ token: inv.token, displayName: username, username, password: "Race123456" });
    const results = await Promise.allSettled([attempt("race_one"), attempt("race_two")]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(failed[0].reason).toMatchObject({ status: 410, code: "INVITE_USED" });
    // the loser's user insert was rolled back with the transaction
    const created = ["race_one", "race_two"].filter((u) => m.users.findUserByUsername(u));
    expect(created).toHaveLength(1);
    expect(m.invites.findInviteByToken(inv.token)?.useCount).toBe(1);
  });

  it("suggests free usernames and persists settings + device token", () => {
    const yy = new Date().getFullYear() % 100;
    expect(m.users.usernameSuggestions("bao", "Bảo")).toEqual(["bao2", `bao_${yy}`]);
    const bao = m.users.findUserByUsername("bao")!;
    expect(m.settings.getUserSettings(bao.id).quality).toBe("1080p");
    expect(m.settings.setUserSettings(bao.id, { quality: "2160p", sub_lang: "en" })).toMatchObject({ quality: "2160p", sub_lang: "en", auto_translate: false });
    const a = m.device.ensureDeviceToken(bao.id);
    expect(m.device.ensureDeviceToken(bao.id).token).toBe(a.token);
    expect(a.manifestUrl).toBe(`http://localhost:3000/stremio/${a.token}/manifest.json`);
  });

  it("lists invites with the consumer's username in one joined query", () => {
    const list = m.invites.listInvites();
    const used = list.find((i) => i.state === "used" && i.usedByName === "Bảo"); // display name (admin chip "Đã dùng · Bảo")
    expect(used).toBeDefined();
    expect(list.every((i) => !("tokenHash" in i))).toBe(true);
  });

  it("expires sessions server-side (30d remember / 24h otherwise) and prunes them", async () => {
    const sessions = await import("@/lib/auth/session-service");
    const { getDb, schema } = await import("@/lib/db/sqlite-client");
    const bao = m.users.findUserByUsername("bao")!;
    const h = 60 * 60 * 1000;
    const now = Date.now();
    expect(sessions.isSessionExpired({ remember: false, lastSeenAt: new Date(now - 23 * h) }, now)).toBe(false);
    expect(sessions.isSessionExpired({ remember: false, lastSeenAt: new Date(now - 25 * h) }, now)).toBe(true);
    expect(sessions.isSessionExpired({ remember: true, lastSeenAt: new Date(now - 29 * 24 * h) }, now)).toBe(false);
    expect(sessions.isSessionExpired({ remember: true, lastSeenAt: new Date(now - 31 * 24 * h) }, now)).toBe(true);

    const rows = [
      { id: "s-fresh", remember: false, lastSeenAt: new Date(now - 1 * h) },
      { id: "s-idle-old", remember: false, lastSeenAt: new Date(now - 25 * h) },
      { id: "s-remember-ok", remember: true, lastSeenAt: new Date(now - 20 * 24 * h) },
      { id: "s-remember-old", remember: true, lastSeenAt: new Date(now - 31 * 24 * h) },
    ];
    getDb().insert(schema.sessions).values(rows.map((r) => ({ ...r, userId: bao.id }))).run();
    expect(sessions.pruneExpiredSessions(now)).toBe(2);
    expect(sessions.listSessions(bao.id, "s-fresh").map((s) => s.id).sort()).toEqual(["s-fresh", "s-remember-ok"]);
  });
});
