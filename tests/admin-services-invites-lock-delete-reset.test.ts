import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** Admin services on a real SQLite: invites (create / revoke / recreate / masked list), lock = sessions + streams gone, delete cascade, temp password (48 h), resend login. */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lumen-p6b-"));
process.env.DATA_DIR = tmp;
process.env.SESSION_SECRET = "test-secret-test-secret-test-secret-1234";
process.env.ADMIN_USERNAME = "owner";
process.env.ADMIN_PASSWORD = "admin-pass-123";
process.env.APP_URL = "http://localhost:3000";

type Mods = {
  users: typeof import("@/lib/users/user-service");
  invites: typeof import("@/lib/invites/invite-service");
  accept: typeof import("@/lib/invites/accept-invite");
  actions: typeof import("@/lib/admin/admin-user-actions");
  members: typeof import("@/lib/admin/admin-users-service");
  device: typeof import("@/lib/auth/device-token");
  temp: typeof import("@/lib/admin/temp-password");
  profile: typeof import("@/lib/users/profile-service");
  db: typeof import("@/lib/db/sqlite-client");
  registry: typeof import("@/lib/play/stream-registry");
};
let m: Mods;
let admin: { id: number; displayName: string };

beforeAll(async () => {
  m = {
    users: await import("@/lib/users/user-service"),
    invites: await import("@/lib/invites/invite-service"),
    accept: await import("@/lib/invites/accept-invite"),
    actions: await import("@/lib/admin/admin-user-actions"),
    members: await import("@/lib/admin/admin-users-service"),
    device: await import("@/lib/auth/device-token"),
    temp: await import("@/lib/admin/temp-password"),
    profile: await import("@/lib/users/profile-service"),
    db: await import("@/lib/db/sqlite-client"),
    registry: await import("@/lib/play/stream-registry"),
  };
  await m.users.seedAdminFromEnv();
  const a = m.users.findUserByUsername("owner")!;
  admin = { id: a.id, displayName: a.displayName };
});
afterAll(() => {
  m.db.closeDb();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("invites (admin table)", () => {
  it("valid invite exposes a masked + full URL; revoke drops it; recreate issues a fresh one with the same note", () => {
    const inv = m.invites.createInvite({ createdBy: admin.id, note: "Mời Đạt", expiresDays: 7 });
    let row = m.invites.listInvites().find((i) => i.id === inv.id)!;
    expect(row.state).toBe("valid");
    expect(row.url).toBe(inv.url);
    expect(row.maskedUrl).toMatch(/\/invite\/[A-Za-z0-9_-]{4}…[A-Za-z0-9_-]{2}$/);
    expect(row.createdByName).toBe("Admin");
    expect(JSON.stringify(row)).not.toContain("tokenHash");

    expect(m.invites.revokeInvite(inv.id)?.revokedAt).toBeTruthy();
    row = m.invites.listInvites().find((i) => i.id === inv.id)!;
    expect(row.state).toBe("invalid");
    expect(row.url).toBeNull();
    expect(m.invites.validateInvite(inv.token).state).toBe("invalid");

    const again = m.invites.recreateInvite(inv.id, admin.id);
    if (again === null || again === "STILL_VALID") throw new Error(`expected a fresh invite, got ${String(again)}`);
    expect(again.note).toBe("Mời Đạt");
    expect(again.token).not.toBe(inv.token);
    expect(m.invites.validateInvite(again.token).state).toBe("valid");
    // the fresh one still works → "Tạo lại" on it is refused (no two live links for one note)
    expect(m.invites.recreateInvite(again.id, admin.id)).toBe("STILL_VALID");
    expect(m.invites.recreateInvite(999_999, admin.id)).toBeNull();
  });

  it("a consumed single-use invite loses its raw token (no copy button) and shows the member's name", async () => {
    const inv = m.invites.createInvite({ createdBy: admin.id, note: "Mời Bảo", expiresDays: 7 });
    await m.accept.acceptInvite({ token: inv.token, displayName: "Bảo", username: "bao", password: "Bao123456" });
    const row = m.invites.listInvites().find((i) => i.id === inv.id)!;
    expect(row.state).toBe("used");
    expect(row.usedByName).toBe("Bảo");
    expect(row.url).toBeNull();
  });
});

describe("member actions", () => {
  it("lock deletes every session + live stream handle and keeps lists; unlock restores; self / last admin refused", async () => {
    const bao = m.users.findUserByUsername("bao")!;
    const { getDb, schema } = m.db;
    getDb().insert(schema.sessions).values([{ id: "s1", userId: bao.id, deviceLabel: "Chrome · Windows" }, { id: "s2", userId: bao.id, deviceLabel: "Safari · iPhone" }]).run();
    getDb().insert(schema.myList).values({ userId: bao.id, mediaType: "movie", tmdbId: 1 }).run();
    const stream = m.registry.registerStream({ cdnUrl: "https://cdn.example/f", torrentId: 1, fileId: 0, fileName: "a.mp4", userId: bao.id, mediaKey: "movie:1", release: { hash: "a".repeat(40), title: "t", qualityLabel: "1080p" }, playClass: "direct" });
    const other = m.registry.registerStream({ cdnUrl: "https://cdn.example/g", torrentId: 2, fileId: 0, fileName: "b.mp4", userId: admin.id, mediaKey: "movie:2", release: { hash: "b".repeat(40), title: "t", qualityLabel: "1080p" }, playClass: "direct" });
    const locked = await m.actions.lockMember(admin, bao.id);
    expect(locked.id).toBe(bao.id);
    expect(m.users.findUserByUsername("bao")!.disabled).toBe(true);
    expect(getDb().select().from(schema.sessions).all().filter((s) => s.userId === bao.id)).toHaveLength(0);
    expect(getDb().select().from(schema.myList).all().filter((r) => r.userId === bao.id)).toHaveLength(1);
    expect(m.registry.getStream(stream.streamId, bao.id)).toBeNull();
    expect(m.registry.getStream(other.streamId, admin.id)).not.toBeNull();
    expect(m.members.memberStatus(m.users.findUserByUsername("bao")!)).toBe("off");
    m.actions.unlockMember(admin, bao.id);
    expect(m.users.findUserByUsername("bao")!.disabled).toBe(false);
    await expect(m.actions.lockMember(admin, admin.id)).rejects.toThrow(/SELF/);
    expect(() => m.actions.changeRole(admin, admin.id, "member")).toThrow(/SELF/);
    await expect(m.actions.lockMember({ id: bao.id, displayName: "Bảo" }, admin.id)).rejects.toThrow(/LAST_ADMIN/);
    expect(() => m.actions.getUserOrThrow(424242)).toThrow(/NOT_FOUND/);
  });

  it("reset password issues a Gk7-mPx2-Q9w style code valid 48 h, sets must_change_password; changing it clears the flag + other sessions", async () => {
    const bao = m.users.findUserByUsername("bao")!;
    const { getDb, schema } = m.db;
    const { tempPassword } = await m.actions.resetMemberPassword(admin, bao.id);
    expect(tempPassword).toMatch(m.temp.TEMP_PASSWORD_RE);
    expect(tempPassword).not.toMatch(/[0OIl1]/);
    const after = m.users.findUserByUsername("bao")!;
    expect(after.mustChangePassword).toBe(true);
    expect(after.passwordResetAt).toBeInstanceOf(Date);
    expect(m.temp.isTempPasswordExpired(after)).toBe(false);
    expect(m.temp.isTempPasswordExpired(after, after.passwordResetAt!.getTime() + m.temp.TEMP_PASSWORD_TTL_MS + 1)).toBe(true);
    expect(m.temp.isTempPasswordExpired({ mustChangePassword: false, passwordResetAt: new Date(0) })).toBe(false);
    expect(m.temp.isTempPasswordExpired({ mustChangePassword: true, passwordResetAt: null })).toBe(false);
    expect(await m.users.verifyPassword(tempPassword, after.passwordHash)).toBe(true);
    expect(await m.profile.changePassword(bao.id, "wrong-pass", "NewPass12345")).toBe("PW_WRONG");
    expect(await m.profile.changePassword(bao.id, tempPassword, "short")).toBe("WEAK_PASSWORD");
    getDb().insert(schema.sessions).values([{ id: "keep", userId: bao.id, deviceLabel: "Chrome · Windows" }, { id: "drop", userId: bao.id, deviceLabel: "Safari · iPhone" }]).run();
    expect(await m.profile.changePassword(bao.id, tempPassword, "NewPass12345", "keep")).toBe("ok");
    const changed = m.users.findUserByUsername("bao")!;
    expect(changed.mustChangePassword).toBe(false);
    expect(changed.passwordResetAt).toBeNull();
    expect(getDb().select().from(schema.sessions).all().filter((s) => s.userId === bao.id).map((s) => s.id)).toEqual(["keep"]);
    expect(m.temp.generateTempPassword(() => 0)).toBe("AAA-AAAA-AAA");
  });

  it("role change + revoke stremio + resend login (never-logged-in members only)", async () => {
    const bao = m.users.findUserByUsername("bao")!;
    const { getDb, schema } = m.db;
    const { eq } = await import("drizzle-orm");
    expect(m.actions.changeRole(admin, bao.id, "admin").role).toBe("admin");
    expect(m.actions.changeRole(admin, bao.id, "member").role).toBe("member");
    const t = m.device.ensureDeviceToken(bao.id).token;
    m.actions.revokeMemberStremio(admin, bao.id);
    expect(m.device.resolveDeviceToken(t)).toBeNull();
    // bao never logged in (last_seen_at null) → a fresh temp password + the login link, shown once
    const resent = await m.actions.resendLogin(admin, bao.id);
    expect(resent.tempPassword).toMatch(m.temp.TEMP_PASSWORD_RE);
    expect(resent.loginUrl).toBe("http://localhost:3000/login");
    expect(await m.users.verifyPassword(resent.tempPassword, m.users.findUserByUsername("bao")!.passwordHash)).toBe(true);
    expect(m.users.findUserByUsername("bao")!.mustChangePassword).toBe(true);
    getDb().update(schema.users).set({ lastSeenAt: new Date() }).where(eq(schema.users.id, bao.id)).run();
    await expect(m.actions.resendLogin(admin, bao.id)).rejects.toThrow(/ALREADY_ACTIVE/);
    await expect(m.actions.resendLogin(admin, admin.id)).rejects.toThrow(/SELF/);
  });

  it("delete cascades progress / my_list / sessions / tokens, re-parents invites, needs the typed username", async () => {
    const u = await m.users.createUser({ username: "khang", displayName: "Khang", password: "KhangPass1234" });
    const { getDb, schema } = m.db;
    getDb().insert(schema.progress).values({ userId: u.id, mediaType: "movie", tmdbId: 2, positionS: 10, durationS: 100, deviceLabel: "x" }).run();
    getDb().insert(schema.myList).values({ userId: u.id, mediaType: "movie", tmdbId: 2 }).run();
    getDb().insert(schema.sessions).values({ id: "khang-s", userId: u.id }).run();
    m.device.ensureDeviceToken(u.id);
    const inv = m.invites.createInvite({ createdBy: u.id, note: "by khang", expiresDays: 7 });
    await expect(m.actions.deleteMember(admin, u.id, "wrong")).rejects.toThrow(/CONFIRM_MISMATCH/);
    await m.actions.deleteMember(admin, u.id, "khang");
    expect(m.users.findUserByUsername("khang")).toBeUndefined();
    expect(getDb().select().from(schema.progress).all().filter((r) => r.userId === u.id)).toHaveLength(0);
    expect(getDb().select().from(schema.myList).all().filter((r) => r.userId === u.id)).toHaveLength(0);
    expect(getDb().select().from(schema.sessions).all().filter((r) => r.userId === u.id)).toHaveLength(0);
    expect(getDb().select().from(schema.deviceTokens).all().filter((r) => r.userId === u.id)).toHaveLength(0);
    expect(getDb().select().from(schema.invites).all().find((r) => r.id === inv.id)?.createdBy).toBe(admin.id);
  });
});
