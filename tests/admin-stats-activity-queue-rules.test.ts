import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** KPI aggregation on SQLite, activity filter rules (pure + db), queue row mapping, new-episode rule, backup pruning. */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lumen-p6c-"));
process.env.DATA_DIR = tmp;
process.env.SESSION_SECRET = "test-secret-test-secret-test-secret-1234";
process.env.ADMIN_USERNAME = "owner";
process.env.ADMIN_PASSWORD = "admin-pass-123";
process.env.APP_URL = "http://localhost:3000";

type Mods = {
  users: typeof import("@/lib/users/user-service");
  stats: typeof import("@/lib/admin/admin-stats-service");
  members: typeof import("@/lib/admin/admin-users-service");
  activity: typeof import("@/lib/admin/admin-activity-service");
  rules: typeof import("@/lib/admin/activity-filter-rules");
  queue: typeof import("@/lib/admin/admin-queue-service");
  log: typeof import("@/lib/activity/log-activity");
  db: typeof import("@/lib/db/sqlite-client");
};
let m: Mods;
let adminId = 0;
const NOW = new Date(2026, 9, 14, 12, 0, 0); // 14/10/2026 12:00 local

beforeAll(async () => {
  m = {
    users: await import("@/lib/users/user-service"),
    stats: await import("@/lib/admin/admin-stats-service"),
    members: await import("@/lib/admin/admin-users-service"),
    activity: await import("@/lib/admin/admin-activity-service"),
    rules: await import("@/lib/admin/activity-filter-rules"),
    queue: await import("@/lib/admin/admin-queue-service"),
    log: await import("@/lib/activity/log-activity"),
    db: await import("@/lib/db/sqlite-client"),
  };
  await m.users.seedAdminFromEnv();
  adminId = m.users.findUserByUsername("owner")!.id;
});
afterAll(() => {
  m.db.closeDb();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("KPI aggregation", () => {
  it("counts active members (30 d), views this month, AI subs, bars per day", async () => {
    const { getDb, schema } = m.db;
    const u1 = await m.users.createUser({ username: "uyen_", displayName: "Uyên", password: "UyenPass12345" });
    const u2 = await m.users.createUser({ username: "khang", displayName: "Khang", password: "KhangPass1234", disabled: true });
    getDb().update(schema.users).set({ lastSeenAt: NOW }).run();
    getDb().update(schema.users).set({ lastSeenAt: new Date(NOW.getTime() - 40 * 86_400_000) }).where((await import("drizzle-orm")).eq(schema.users.id, u1.id)).run();
    const members = m.stats.countActiveMembers(NOW);
    expect(members).toEqual({ total: 3, active: 1 }); // an stale, khang disabled
    const view = (daysAgo: number, userId = adminId) => ({ userId, mediaType: "movie", tmdbId: 1, releaseHash: "", mode: "direct" as const, deviceLabel: "", startedAt: new Date(NOW.getTime() - daysAgo * 86_400_000), lastBeatAt: new Date(NOW.getTime() - daysAgo * 86_400_000) });
    getDb().insert(schema.views).values([view(0), view(1), view(2), view(20, u2.id), view(45)]).run();
    expect(m.stats.countViewsSince(m.stats.monthStart(NOW))).toBe(3); // 14/10, 13/10, 12/10; 24/09 + 30/08 are last month(s)
    const bars = m.stats.viewsPerDay(getDb().select({ startedAt: schema.views.startedAt }).from(schema.views).all().map((r) => r.startedAt), 30, NOW);
    expect(bars).toHaveLength(30);
    expect(bars[0].label).toBe("15/09");
    expect(bars[29].label).toBe("14/10");
    expect(bars[29].count).toBe(1);
    expect(bars.reduce((s, b) => s + b.count, 0)).toBe(4); // the 45-day-old view is outside the window
    getDb().insert(schema.subtitleCache).values([{ mediaKey: "movie:1", lang: "vi", source: "ai", vttPath: "x", costVnd: 520, createdAt: NOW }, { mediaKey: "movie:2", lang: "vi", source: "ai", vttPath: "", costVnd: 999, createdAt: NOW }, { mediaKey: "movie:3", lang: "vi", source: "os", vttPath: "y", createdAt: NOW }]).run();
    expect(m.stats.aiThisMonth(NOW)).toEqual({ count: 1, costVnd: 520 });
  });

  it("member rows: status, filter + search + sort", async () => {
    const rows = await m.members.listMembers(NOW);
    const khang = rows.find((r) => r.username === "khang")!;
    expect(khang.status).toBe("off");
    expect(m.members.filterMembers(rows, "", "locked").map((r) => r.username)).toEqual(["khang"]);
    expect(m.members.filterMembers(rows, "UYÊN", "all").map((r) => r.username)).toEqual(["uyen_"]);
    expect(m.members.filterMembers(rows, "", "all")[0].username).toBe("owner"); // most views this month first
    expect(m.members.memberStatus({ disabled: false, lastSeenAt: null })).toBe("wait");
  });
});

describe("activity", () => {
  it("filters by chip / person / month, labels times, bolds legacy names, exports CSV", () => {
    const { getDb, schema } = m.db;
    getDb().delete(schema.activityLog).run();
    const at = (d: Date, kind: "login" | "view" | "invite" | "join" | "cloud", text: string, userId: number | null = adminId) => getDb().insert(schema.activityLog).values({ kind, text, userId, createdAt: d }).run();
    at(new Date(2026, 9, 14, 8, 31), "view", "<b>Admin</b> bắt đầu xem X (1080p, phát trực tiếp)");
    at(new Date(2026, 9, 13, 23, 10), "login", "Admin đã đăng nhập");
    at(new Date(2026, 9, 12, 9, 0), "invite", "Admin đã tạo link mời (Mời Đạt)");
    at(new Date(2026, 8, 30, 9, 0), "join", "Bảo (@bao) đã tham gia qua link mời", null);
    const all = m.activity.listActivity({ filter: "all", userId: null, month: null }, NOW);
    expect(all.map((e) => e.time)).toEqual(["08:31", "Hôm qua 23:10", "12/10", "30/09"]);
    expect(all[1].html).toBe("<b>Admin</b> đã đăng nhập");
    expect(all[3].html).toBe("Bảo (@bao) đã tham gia qua link mời"); // no user → untouched
    expect(m.activity.listActivity({ filter: "invite", userId: null, month: null }, NOW).map((e) => e.kind)).toEqual(["invite", "join"]);
    expect(m.activity.listActivity({ filter: "login", userId: adminId, month: "2026-10" }, NOW)).toHaveLength(1);
    expect(m.activity.listActivity({ filter: "all", userId: null, month: "2026-09" }, NOW)).toHaveLength(1);
    expect(m.rules.kindsForFilter("cloud")).toEqual(["cloud"]);
    expect(m.rules.monthWindow("2026-13")).toBeNull();
    const csv = m.rules.activityCsv(all);
    expect(csv.startsWith("﻿Thời gian,Loại,Người,Nội dung")).toBe(true);
    expect(csv).toContain("Admin bắt đầu xem X (1080p, phát trực tiếp)");
    expect(csv).not.toContain("<b>");
  });
});

describe("queue rows + daily rules", async () => {
  const { isNotifiableEpisode } = await import("@/lib/ops/new-episode-checker");
  const { pruneBackups, msUntilNextRun } = await import("@/lib/ops/sqlite-backup");

  it("maps a cloud job to the admin table row", () => {
    const base = { id: 1, userId: 1, hash: "x", torboxTorrentId: 1, mediaType: "tv", tmdbId: 1, season: 1, episode: null, title: "Tướng Quân", releaseLabel: "Shogun.S01.1080p.WEB.H264-NTb.mkv", fileName: "Shogun.S01.1080p.WEB.H264-NTb.mkv", sizeBytes: 24 * 1024 ** 3, state: "downloading" as const, progress: 73.4, speedBps: 38 * 1024 * 1024, etaS: 60, errorMsg: null, appQueuePos: null, createdAt: NOW, finishedAt: null };
    const row = m.queue.toQueueRow(base, "Admin");
    expect(row.title).toBe("Tướng Quân S1 (trọn mùa)");
    expect(row.release).toBe("1080p MKV NTb 24.0 GB");
    expect(row.progress).toBe(73);
    expect(row.speedLabel).toBe("38 MB/s");
    expect(row.etaLabel).toBe("~1 phút");
    const queued = m.queue.toQueueRow({ ...base, state: "queued", appQueuePos: 2, speedBps: 0, etaS: 0 }, "Admin");
    expect(queued.speedLabel).toBe("—");
    expect(queued.appQueuePos).toBe(2);
    const done = m.queue.toQueueRow({ ...base, state: "ready", finishedAt: new Date(2026, 9, 14, 7, 12) }, "Admin");
    expect(done.finishedLabel).toBe("07:12");
  });

  it("new-episode rule: aired within 7 days only; backup pruning keeps 14; next run is tomorrow 03:15 when past", () => {
    expect(isNotifiableEpisode({ season_number: 2, episode_number: 4, air_date: "2026-10-12" }, NOW)).toBe(true);
    expect(isNotifiableEpisode({ season_number: 2, episode_number: 4, air_date: "2026-09-01" }, NOW)).toBe(false);
    expect(isNotifiableEpisode({ season_number: 2, episode_number: 4, air_date: "2026-10-20" }, NOW)).toBe(false);
    expect(isNotifiableEpisode(null, NOW)).toBe(false);
    const dir = path.join(tmp, "backups");
    fs.mkdirSync(dir, { recursive: true });
    for (let i = 1; i <= 16; i++) fs.writeFileSync(path.join(dir, `lumen-202610${String(i).padStart(2, "0")}.sqlite`), "x");
    const kept = pruneBackups(dir, 14);
    expect(kept).toHaveLength(14);
    expect(fs.readdirSync(dir)).toHaveLength(14);
    expect(kept[0]).toBe("lumen-20261016.sqlite");
    expect(msUntilNextRun(new Date(2026, 9, 14, 4, 0), 3, 15)).toBe((23 * 60 + 15) * 60_000);
    expect(msUntilNextRun(new Date(2026, 9, 14, 2, 0), 3, 15)).toBe(75 * 60_000);
  });
});
