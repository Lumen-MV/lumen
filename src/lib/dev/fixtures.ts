import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db/sqlite-client";
import { createUser, findUserByUsername, hashPassword } from "@/lib/users/user-service";
import { createInvite, inviteUrl } from "@/lib/invites/invite-service";
import { hashToken } from "@/lib/auth/invite-token";
import { clearAllLoginFailures } from "@/lib/auth/login-rate-limit";
import { clearExternalRateBuckets } from "@/lib/play/external-rate-limit";
import { clearStremioRateBuckets } from "@/lib/stremio/stremio-rate-limit";
import { clearSignedSubtitleRateBuckets } from "@/lib/subtitles/signed-subtitle-url";
import { DAY_MS } from "@/lib/format/time-format";
import { clearCloudJobs, clearTitleSources, cloudFixtureSchemas, seedCloudJobs } from "./fixtures-cloud";
import { clearViews, progressFixtureSchemas, seedMyList, seedProgress, seedViewers } from "./fixtures-progress";
import { clearSubs, seedOsQuota, seedSubRow, seedSubs, seedTranslateJobs, subsFixtureSchemas } from "./fixtures-subs";
import { adminFixtureSchemas, clearAdminData, seedAdminData } from "./fixtures-admin";

/**
 * Dev-only seed helpers used by scripts/shoot-states.mjs to reproduce mockup states with real data.
 * Reachable only through POST /api/dev/seed, which 404s unless LUMEN_SCENARIOS=1.
 */
export const fixtureSchema = z.discriminatedUnion("fixture", [
  z.object({ fixture: z.literal("user"), username: z.string(), displayName: z.string(), password: z.string().min(8), disabled: z.boolean().optional(), onboarded: z.boolean().optional() }),
  z.object({ fixture: z.literal("delete-user"), username: z.string() }),
  z.object({ fixture: z.literal("invite"), state: z.enum(["valid", "used", "expired"]), usedBy: z.string().optional() }),
  z.object({ fixture: z.literal("reset-rate-limit") }),
  z.object({ fixture: z.literal("clear-notifications") }),
  /** the 4 mockup notifications for the admin (cloud_ready 2 min, subtitle_ready 1 h — unread; new_episode yesterday, member_joined 3 d — read) */
  z.object({ fixture: z.literal("notifications") }),
  z.object({ fixture: z.literal("clear-user-media"), username: z.string().optional() }),
  z.object({ fixture: z.literal("clear-tmdb-cache") }),
  ...cloudFixtureSchemas,
  ...progressFixtureSchemas,
  ...subsFixtureSchemas,
  ...adminFixtureSchemas,
]);

const HOUR_MS = 3_600_000;
const MOCK_NOTIFICATIONS: Array<Omit<typeof schema.notifications.$inferInsert, "userId">> = [
  { type: "cloud_ready", title: "Deadpool & Wolverine", mediaType: "movie", tmdbId: 533535, read: false, createdAt: new Date(Date.now() - 2 * 60_000) },
  { type: "subtitle_ready", title: "Oppenheimer", mediaType: "movie", tmdbId: 872585, read: false, createdAt: new Date(Date.now() - HOUR_MS) },
  { type: "new_episode", title: "Trò Chơi Con Mực", mediaType: "tv", tmdbId: 93405, season: 2, episode: 4, read: true, createdAt: new Date(Date.now() - 26 * HOUR_MS) },
  { type: "member_joined", title: "Bảo", read: true, createdAt: new Date(Date.now() - 3 * DAY_MS) },
];
export type FixtureInput = z.infer<typeof fixtureSchema>;

function adminId(): number {
  const admin = getDb().select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.role, "admin")).get();
  if (!admin) throw new Error("no admin seeded");
  return admin.id;
}

export async function applyFixture(input: FixtureInput): Promise<Record<string, unknown>> {
  const db = getDb();
  switch (input.fixture) {
    case "user": {
      const existing = findUserByUsername(input.username);
      // never touch the admin account (its password comes from env only)
      if (existing?.role === "admin") return { username: existing.username, created: false, admin: true };
      if (existing) {
        db.update(schema.users)
          .set({ disabled: input.disabled ?? existing.disabled, onboarded: input.onboarded ?? existing.onboarded, passwordHash: await hashPassword(input.password), displayName: input.displayName })
          .where(eq(schema.users.id, existing.id))
          .run();
        return { username: existing.username, created: false };
      }
      const u = await createUser({ username: input.username, displayName: input.displayName, password: input.password, disabled: input.disabled, onboarded: input.onboarded ?? true });
      return { username: u.username, created: true };
    }
    case "delete-user": {
      const u = findUserByUsername(input.username);
      if (u && u.role !== "admin") db.delete(schema.users).where(eq(schema.users.id, u.id)).run();
      return { deleted: Boolean(u) };
    }
    case "invite": {
      const inv = createInvite({ createdBy: adminId(), note: `fixture:${input.state}`, expiresDays: 7 });
      if (input.state === "expired") {
        db.update(schema.invites).set({ expiresAt: new Date(Date.now() - 2 * DAY_MS) }).where(eq(schema.invites.id, inv.id)).run();
      } else if (input.state === "used") {
        const usedByName = input.usedBy ?? "bao";
        const usedBy = findUserByUsername(usedByName) ?? (await createUser({ username: usedByName, displayName: "Bảo", password: "fixture-pass-123", onboarded: true }));
        db.update(schema.invites).set({ useCount: 1, usedBy: usedBy.id, usedAt: new Date(Date.now() - DAY_MS) }).where(eq(schema.invites.id, inv.id)).run();
      }
      return { token: inv.token, url: inviteUrl(inv.token), tokenHash: hashToken(inv.token) };
    }
    case "reset-rate-limit":
      clearAllLoginFailures();
      clearExternalRateBuckets();
      clearStremioRateBuckets();
      clearSignedSubtitleRateBuckets();
      return { ok: true };
    case "clear-notifications":
      db.delete(schema.notifications).run();
      return { ok: true };
    case "notifications": {
      const userId = adminId();
      db.delete(schema.notifications).where(eq(schema.notifications.userId, userId)).run();
      db.insert(schema.notifications).values(MOCK_NOTIFICATIONS.map((n) => ({ ...n, userId }))).run();
      return { ok: true, count: MOCK_NOTIFICATIONS.length };
    }
    case "clear-user-media": {
      // my_list + likes + progress of one user (default: admin) → "first-time" home / clean My List toggles
      const userId = input.username ? findUserByUsername(input.username)?.id : adminId();
      if (!userId) return { ok: false };
      db.delete(schema.myList).where(eq(schema.myList.userId, userId)).run();
      db.delete(schema.likes).where(eq(schema.likes.userId, userId)).run();
      db.delete(schema.progress).where(eq(schema.progress.userId, userId)).run();
      return { ok: true };
    }
    case "clear-tmdb-cache":
      db.delete(schema.tmdbCache).run();
      return { ok: true };
    case "cloud-jobs":
      return seedCloudJobs(input, adminId());
    case "clear-cloud-jobs":
      clearCloudJobs();
      return { ok: true };
    case "clear-title-sources":
      clearTitleSources();
      return { ok: true };
    case "progress":
      return seedProgress(input, adminId());
    case "my-list":
      return seedMyList(input, adminId());
    case "viewers":
      return seedViewers(input.count, input.keep === true);
    case "clear-views":
      clearViews();
      return { ok: true };
    case "subs":
      return seedSubs(input.mediaKey, adminId());
    case "clear-subs":
      return clearSubs(input.mediaKey, adminId());
    case "translate-jobs":
      return seedTranslateJobs(input.mediaKey, adminId(), input.count);
    case "os-quota":
      return seedOsQuota(input.remaining, input.resetInHours);
    case "subs-row":
      return seedSubRow(input);
    case "admin-data":
      return seedAdminData(adminId());
    case "clear-admin-data":
      clearAdminData();
      return { ok: true };
  }
}
