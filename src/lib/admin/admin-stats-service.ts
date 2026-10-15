import "server-only";
import { and, count, eq, gt, gte, sql, sum } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/sqlite-client";
import { formatDayMonth } from "@/lib/format/time-format";
import { readOsQuota } from "@/lib/subtitles/os-quota-store";
import { OS_DAILY_QUOTA } from "@/lib/subtitles/subtitle-types";
import { ACTIVE_STATES } from "@/lib/cloud/cloud-jobs-store";
import type { ScenarioFlag } from "@/lib/dev/scenario-flags-shared";
import { planLabel, slotLimit, torboxPlan } from "@/lib/torbox/torbox-plan";
import { listWatchingNow, type WatchingNow } from "./watching-now";

/** GET /api/admin/stats — the six KPI cards, the 30-day bar chart and "Đang xem lúc này". */
export type AdminStats = {
  members: { total: number; active: number };
  watchingNow: WatchingNow[];
  viewsMonth: number;
  ai: { count: number; costVnd: number };
  torbox: { plan: string; active: number; limit: number };
  os: { used: number; limit: number; resetAt: number | null };
  bars: Array<{ date: string; label: string; count: number }>;
};
const ACTIVE_MEMBER_DAYS = 30;
const DAY_MS = 86_400_000;

export const monthStart = (now = new Date()): Date => new Date(now.getFullYear(), now.getMonth(), 1);
const dayStart = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Pure: views (startedAt) bucketed per local day for the last `days` days ending today. */
export function viewsPerDay(startedAts: Date[], days: number, now = new Date()): AdminStats["bars"] {
  const first = dayStart(new Date(now.getTime() - (days - 1) * DAY_MS));
  const buckets = Array.from({ length: days }, (_, i) => {
    const d = new Date(first.getTime() + i * DAY_MS);
    return { date: d.toISOString().slice(0, 10), label: formatDayMonth(d), count: 0 };
  });
  for (const t of startedAts) {
    const i = Math.floor((dayStart(t).getTime() - first.getTime()) / DAY_MS);
    if (i >= 0 && i < days) buckets[i].count++;
  }
  return buckets;
}

export function countActiveMembers(now = new Date()): { total: number; active: number } {
  const db = getDb();
  const total = db.select({ n: count() }).from(schema.users).get()?.n ?? 0;
  const active = db.select({ n: count() }).from(schema.users).where(and(eq(schema.users.disabled, false), gt(schema.users.lastSeenAt, new Date(now.getTime() - ACTIVE_MEMBER_DAYS * DAY_MS)))).get()?.n ?? 0;
  return { total, active };
}

export function countViewsSince(since: Date): number {
  return getDb().select({ n: count() }).from(schema.views).where(gte(schema.views.startedAt, since)).get()?.n ?? 0;
}

export function aiThisMonth(now = new Date()): { count: number; costVnd: number } {
  const row = getDb().select({ n: count(), cost: sum(schema.subtitleCache.costVnd) }).from(schema.subtitleCache).where(and(eq(schema.subtitleCache.source, "ai"), gte(schema.subtitleCache.createdAt, monthStart(now)), sql`${schema.subtitleCache.vttPath} != ''`)).get();
  return { count: row?.n ?? 0, costVnd: Number(row?.cost ?? 0) };
}

export function torboxActiveSlots(): number {
  return getDb().select({ n: count() }).from(schema.cloudJobs).where(and(sql`${schema.cloudJobs.state} IN (${sql.join(ACTIVE_STATES.map((s) => sql`${s}`), sql`, `)})`, sql`${schema.cloudJobs.appQueuePos} IS NULL`)).get()?.n ?? 0;
}

export async function getAdminStats(scenario: Set<ScenarioFlag>, now = new Date()): Promise<AdminStats> {
  const plan = scenario.has("torbox-down") ? null : await torboxPlan(now.getTime());
  const quota = readOsQuota(scenario, now.getTime());
  const bars = viewsPerDay(getDb().select({ startedAt: schema.views.startedAt }).from(schema.views).where(gte(schema.views.startedAt, new Date(now.getTime() - 30 * DAY_MS))).all().map((r) => r.startedAt), 30, now);
  return {
    members: countActiveMembers(now),
    watchingNow: await listWatchingNow(now),
    viewsMonth: countViewsSince(monthStart(now)),
    ai: aiThisMonth(now),
    torbox: { plan: planLabel(plan), active: torboxActiveSlots(), limit: slotLimit(plan) },
    os: { used: OS_DAILY_QUOTA - Math.min(OS_DAILY_QUOTA, quota.remaining), limit: OS_DAILY_QUOTA, resetAt: quota.resetAt },
    bars,
  };
}
