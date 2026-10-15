import "server-only";
import { getEnv } from "@/lib/config/env";
import { copy } from "@/lib/copy-vi";
import { torboxQueue } from "@/lib/cloud/cloud-jobs-store";
import { getMe } from "./torbox-client";

/**
 * Admin KPI "Torbox · Pro · a/b slot": the plan id comes from ONE `/user/me` call memoised for 6 h per process (the
 * budget-conscious choice: the dashboard never polls TorBox). The active-download limit is whatever the last
 * `createtorrent` reported (`active_limit`), else the plan's known limit, else MAX_CLOUD_JOBS.
 */
const PLAN_TTL_MS = 6 * 3_600_000;
const PLAN_SLOTS: Record<number, number> = { 0: 1, 1: 3, 2: 10, 3: 10 };
type PlanMemo = { plan: number | null; at: number };
const g = globalThis as unknown as { __hcTorboxPlan?: PlanMemo };

export async function torboxPlan(now = Date.now()): Promise<number | null> {
  const memo = g.__hcTorboxPlan;
  if (memo && now - memo.at < PLAN_TTL_MS) return memo.plan;
  if (!getEnv().TORBOX_API_KEY) return null;
  try {
    const me = await getMe();
    g.__hcTorboxPlan = { plan: typeof me?.plan === "number" ? me.plan : null, at: now };
  } catch (err) {
    console.warn("[torbox] plan lookup failed", err instanceof Error ? err.message : err);
    g.__hcTorboxPlan = { plan: memo?.plan ?? null, at: now - PLAN_TTL_MS + 10 * 60_000 }; // retry in 10 min
  }
  return g.__hcTorboxPlan.plan;
}

export const planLabel = (plan: number | null): string => (plan === null ? copy.admin.kpi.planUnknown : (copy.admin.kpi.plan[plan] ?? `#${plan}`));

export function slotLimit(plan: number | null): number {
  const fromQueue = [...torboxQueue().values()].map((q) => q.limit).find((l) => l > 0);
  return fromQueue ?? (plan !== null ? PLAN_SLOTS[plan] : undefined) ?? getEnv().MAX_CLOUD_JOBS;
}

/** Tests / dev: pin the memo. */
export const setTorboxPlanMemo = (plan: number | null, at = Date.now()): void => void (g.__hcTorboxPlan = { plan, at });
