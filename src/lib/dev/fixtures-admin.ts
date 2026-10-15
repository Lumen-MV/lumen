import { randomBytes } from "node:crypto";
import { eq, inArray, like, lt } from "drizzle-orm";
import { z } from "zod";
import { copy } from "@/lib/copy-vi";
import { getDb, schema } from "@/lib/db/sqlite-client";
import { ensureDeviceToken } from "@/lib/auth/device-token";
import { createInvite } from "@/lib/invites/invite-service";
import { setUserSettings } from "@/lib/users/user-settings";
import { avatarColorFor, findUserByUsername, hashPassword } from "@/lib/users/user-service";
import { seedCloudJobs } from "./fixtures-cloud";

/**
 * Dev-only `admin-data` fixture (POST /api/dev/seed): the members, sessions, device token, live views, month views,
 * invites, cloud jobs and activity rows of admin.html so every admin / settings state renders with real data.
 * Destructive for sessions of other users, invites, cloud jobs, views and the activity log (dev DB only).
 */
export const adminFixtureSchemas = [z.object({ fixture: z.literal("admin-data") }), z.object({ fixture: z.literal("clear-admin-data") })] as const;
const DAY = 86_400_000, HOUR = 3_600_000, MIN = 60_000;
const MEMBERS = [
  { u: "an", n: "An", seen: 0, views: 18, sessions: ["Safari · iPad"] },
  { u: "bao", n: "Bảo", seen: 0, views: 22, sessions: [], stremio: true, quality: "2160p" as const },
  { u: "quang", n: "Quang", seen: 3 * DAY, views: 9, sessions: ["Chrome · Mac OS"] },
  { u: "thu", n: "Thư", seen: 7 * DAY, views: 4, sessions: ["Safari · iPhone"] },
  { u: "khang", n: "Khang", seen: 14 * DAY, views: 0, sessions: [], disabled: true },
  { u: "dat", n: "Đạt", seen: null, views: 0, sessions: [] },
];
const sid = () => randomBytes(24).toString("base64url");

/** Inserted directly (not through createUser) so the mockup's 2-letter "an" login can exist in the dev DB. */
async function ensureMember(m: (typeof MEMBERS)[number], now: number): Promise<number> {
  const passwordHash = await hashPassword(`${m.n}Pass123`);
  const u = findUserByUsername(m.u) ?? getDb().insert(schema.users).values({ username: m.u, displayName: m.n, passwordHash, avatarColor: avatarColorFor(m.u), onboarded: true }).returning().get();
  // re-seeding also resets whatever a previous QA run changed (temp password, role, lock)
  getDb().update(schema.users).set({ displayName: m.n, passwordHash, mustChangePassword: false, role: "member", disabled: Boolean(m.disabled), lastSeenAt: m.seen === null ? null : new Date(now - m.seen) }).where(eq(schema.users.id, u.id)).run();
  if (m.quality) setUserSettings(u.id, { quality: m.quality });
  return u.id;
}

function seedViews(userId: number, count: number, now: number): void {
  // spread over the days already elapsed this month so "lượt xem tháng này" equals `count`
  const span = Math.max(1, Math.min(29, new Date(now).getDate() - 1));
  const rows = Array.from({ length: count }, (_, i) => {
    const at = new Date(now - ((i * 7) % span) * DAY - (i % 5) * HOUR - 10 * MIN);
    return { userId, mediaType: "movie", tmdbId: 634649 + i, releaseHash: "", mode: "direct" as const, deviceLabel: "fixture", startedAt: at, lastBeatAt: at };
  });
  if (rows.length) getDb().insert(schema.views).values(rows).run();
}

export async function seedAdminData(adminId: number, now = Date.now()): Promise<{ members: number }> {
  const db = getDb();
  clearAdminData();
  const ids = new Map<string, number>();
  for (const m of MEMBERS) ids.set(m.u, await ensureMember(m, now));
  const nameOf = (u: string) => MEMBERS.find((m) => m.u === u)!.n;
  const adminName = db.select({ n: schema.users.displayName }).from(schema.users).where(eq(schema.users.id, adminId)).get()?.n ?? "Admin";
  // sessions (the admin's own live session stays; the extra rows feed "Phiên đăng nhập" + the devices column)
  const sessions = [{ userId: adminId, deviceLabel: "Safari · iPhone", lastSeenAt: new Date(now - DAY - 3 * HOUR) }, { userId: adminId, deviceLabel: "Chrome · Android TV", lastSeenAt: new Date(now - 5 * DAY) }];
  for (const m of MEMBERS) for (const label of m.sessions) sessions.push({ userId: ids.get(m.u)!, deviceLabel: label, lastSeenAt: new Date(now - (m.seen ?? 0)) });
  db.insert(schema.sessions).values(sessions.map((s) => ({ id: sid(), userId: s.userId, deviceLabel: s.deviceLabel, userAgent: "fixture", ip: "", remember: true, createdAt: s.lastSeenAt, lastSeenAt: s.lastSeenAt }))).run();
  ensureDeviceToken(adminId);
  db.update(schema.deviceTokens).set({ lastUsedAt: new Date(now - 3 * DAY) }).where(eq(schema.deviceTokens.userId, adminId)).run();
  for (const m of MEMBERS) if (m.stremio) ensureDeviceToken(ids.get(m.u)!);
  // month views + the three live viewers (admin 1:02 into Dune 2, Bảo on Stremio, An on iPad)
  seedViews(adminId, 31, now);
  for (const m of MEMBERS) seedViews(ids.get(m.u)!, m.views, now);
  const live = (userId: number, mediaType: string, tmdbId: number, mode: "direct" | "stremio", deviceLabel: string, season: number | null = null, episode: number | null = null) => ({ userId, mediaType, tmdbId, season, episode, releaseHash: "", mode, deviceLabel, startedAt: new Date(now - 20 * MIN), lastBeatAt: new Date(now) });
  db.insert(schema.views).values([live(adminId, "movie", 693134, "direct", "Chrome · Windows"), live(ids.get("bao")!, "tv", 93405, "stremio", copy.stremio.deviceLabel, 2, 3), live(ids.get("an")!, "movie", 1022789, "direct", "Safari · iPad")]).run();
  db.insert(schema.progress).values({ userId: adminId, mediaType: "movie", tmdbId: 693134, season: 0, episode: 0, positionS: 62, durationS: 9960, completed: false, deviceLabel: "Chrome · Windows", updatedAt: new Date(now) }).onConflictDoUpdate({ target: [schema.progress.userId, schema.progress.mediaType, schema.progress.tmdbId, schema.progress.season, schema.progress.episode], set: { positionS: 62, durationS: 9960, completed: false, updatedAt: new Date(now) } }).run();
  // invites (listed newest first, like the mock): expired "Nhóm cũ", used "Mời Bảo", valid "Mời Đạt" (5 days left)
  const old = createInvite({ createdBy: adminId, note: "Nhóm cũ", expiresDays: 7 });
  db.update(schema.invites).set({ expiresAt: new Date(now - 9 * DAY), token: null, createdAt: new Date(now - 16 * DAY) }).where(eq(schema.invites.id, old.id)).run();
  const bao = createInvite({ createdBy: adminId, note: copy.admin.invites.noteFor("Bảo"), expiresDays: 7 });
  db.update(schema.invites).set({ useCount: 1, usedBy: ids.get("bao")!, usedAt: new Date(now - 2 * DAY), token: null, expiresAt: new Date(now + 3 * DAY), createdAt: new Date(now - 4 * DAY) }).where(eq(schema.invites.id, bao.id)).run();
  const dat = createInvite({ createdBy: adminId, note: copy.admin.invites.noteFor("Đạt"), expiresDays: 7 });
  db.update(schema.invites).set({ expiresAt: new Date(now + 5 * DAY), createdAt: new Date(now - 2 * DAY) }).where(eq(schema.invites.id, dat.id)).run();
  // cloud jobs (dev fake TorBox): downloading ×2, app-queued season pack, failed, 2 finished today
  const GB = 1024 ** 3;
  seedCloudJobs({ fixture: "cloud-jobs", mediaKey: "movie:533535", title: "Deadpool & Wolverine", jobs: [{ hash: "d".repeat(40), state: "downloading", progress: 73, speedBps: 38 * 1024 * 1024, etaS: 60, sizeBytes: 2.1 * GB, fileName: "Deadpool.and.Wolverine.2024.1080p.WEBRip.x264.AAC5.1-YTS.mp4" }] }, ids.get("bao")!);
  seedCloudJobs({ fixture: "cloud-jobs", mediaKey: "movie:558449", title: "Võ Sĩ Giác Đấu II", jobs: [{ hash: "e".repeat(40), state: "downloading", progress: 15, speedBps: 6 * 1024 * 1024, etaS: 660, sizeBytes: 4.4 * GB, fileName: "Gladiator.II.2024.1080p.x265-RARBG.mkv" }] }, ids.get("quang")!);
  seedCloudJobs({ fixture: "cloud-jobs", mediaKey: "tv:126308:1:1", title: "Tướng Quân", jobs: [{ hash: "f".repeat(40), state: "queued", appQueued: true, sizeBytes: 24 * GB, fileName: "Shogun.S01.1080p.WEB.H264-NTb.mkv", pack: true }] }, adminId);
  seedCloudJobs({ fixture: "cloud-jobs", mediaKey: "movie:9999999", title: "Phim lạ 1998", jobs: [{ hash: "a".repeat(40), state: "error", sizeBytes: 700 * 1024 * 1024, fileName: "Strange.Movie.1998.720p.DVDRip.XviD-OLD.avi" }] }, ids.get("khang")!);
  seedCloudJobs({ fixture: "cloud-jobs", mediaKey: "movie:693134", title: "Hành Tinh Cát: Phần Hai", jobs: [{ hash: "b".repeat(40), state: "ready", sizeBytes: 2.4 * GB, fileName: "Dune.Part.Two.2024.1080p.WEB-DL.x264-YTS.mp4", finishedAt: todayAt(7, 12, now) }] }, adminId);
  seedCloudJobs({ fixture: "cloud-jobs", mediaKey: "movie:1022789", title: "Những Mảnh Ghép Cảm Xúc 2", jobs: [{ hash: "c".repeat(40), state: "ready", sizeBytes: 1.9 * GB, fileName: "Inside.Out.2.2024.1080p.WEB-DL.x264-YTS.mp4", finishedAt: todayAt(6, 40, now) }] }, ids.get("an")!);
  // activity timeline (admin.html order, newest first)
  const a = copy.admin.activity;
  const yesterday = (h: number, m: number) => new Date(todayAt(h, m, now).getTime() - DAY);
  const rows: Array<[number | null, (typeof schema.activityLog.$inferInsert)["kind"], string, Date]> = [
    [adminId, "view", a.view(adminName, "Hành Tinh Cát: Phần Hai", "1080p"), new Date(now - 5 * MIN)],
    [ids.get("bao")!, "view", a.viewApp(nameOf("bao"), "Trò Chơi Con Mực S2 T3", copy.stremio.app), new Date(now - 16 * MIN)],
    [ids.get("an")!, "translate", a.translate(nameOf("an"), "Những Mảnh Ghép Cảm Xúc 2", "1.500", "520"), new Date(now - 41 * MIN)],
    [null, "cloud", a.cloudDone("Hành Tinh Cát: Phần Hai", adminName), new Date(now - 84 * MIN)],
    [ids.get("quang")!, "cloud", a.cloudReq(nameOf("quang"), "Võ Sĩ Giác Đấu II"), new Date(now - 98 * MIN)],
    [ids.get("thu")!, "login", a.login(nameOf("thu"), "iPhone (Safari)"), yesterday(23, 10)],
    [adminId, "invite", a.invite(adminName, copy.admin.invites.noteFor("Đạt")), yesterday(21, 0)],
    [ids.get("bao")!, "join", a.join(nameOf("bao")), new Date(now - 2 * DAY)],
  ];
  db.insert(schema.activityLog).values(rows.map(([userId, kind, text, createdAt]) => ({ userId, kind, text, createdAt }))).run();
  return { members: MEMBERS.length + 1 };
}

const todayAt = (h: number, m: number, now: number): Date => {
  const d = new Date(now);
  d.setHours(h, m, 0, 0);
  return d.getTime() > now ? new Date(now - 10 * MIN) : d;
};

/** Removes everything the fixture owns (members stay; `delete-user` handles them) so other suites start clean. */
export function clearAdminData(): void {
  const db = getDb();
  const fixtureUsers = db.select({ id: schema.users.id }).from(schema.users).where(inArray(schema.users.username, MEMBERS.map((m) => m.u))).all().map((u) => u.id);
  db.delete(schema.users).where(like(schema.users.username, "viewer%")).run();
  db.delete(schema.sessions).where(eq(schema.sessions.userAgent, "fixture")).run();
  // stale admin sessions left behind by crashed QA runs (idle > 1 h) would flood "Phiên đăng nhập" / the devices column
  db.delete(schema.sessions).where(lt(schema.sessions.lastSeenAt, new Date(Date.now() - HOUR))).run();
  if (fixtureUsers.length) db.delete(schema.sessions).where(inArray(schema.sessions.userId, fixtureUsers)).run();
  db.delete(schema.views).run();
  db.delete(schema.invites).run();
  db.delete(schema.cloudJobs).run();
  db.delete(schema.activityLog).run();
}
