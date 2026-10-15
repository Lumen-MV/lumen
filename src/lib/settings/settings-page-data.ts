import "server-only";
import type { SessionRow } from "@/components/settings/sessions-section";
import type { SubtitleStats } from "@/components/settings/subtitles-section";
import { aiThisMonth } from "@/lib/admin/admin-stats-service";
import { describeDeviceToken, type DeviceTokenState } from "@/lib/auth/device-token";
import { listSessions } from "@/lib/auth/session-service";
import { copy } from "@/lib/copy-vi";
import { currentScenario } from "@/lib/dev/scenario-flags-server";
import { formatRelativeVi } from "@/lib/format/time-format";
import { readOsQuota, resetHours } from "@/lib/subtitles/os-quota-store";
import { OS_DAILY_QUOTA } from "@/lib/subtitles/subtitle-types";

/** Server-side loaders for /settings sections (one DB read each; no external calls). */
export async function subtitleStats(): Promise<SubtitleStats> {
  const quota = readOsQuota(await currentScenario());
  const ai = aiThisMonth();
  return { quotaUsed: OS_DAILY_QUOTA - Math.min(OS_DAILY_QUOTA, quota.remaining), quotaLimit: OS_DAILY_QUOTA, resetHours: resetHours(quota), aiCount: ai.count, aiCostVnd: ai.costVnd };
}

export function deviceTokenDto(userId: number): { url: string | null; masked: string | null; revoked: boolean } {
  const s: DeviceTokenState = describeDeviceToken(userId);
  return { url: s.url, masked: s.masked, revoked: s.revoked };
}

/** Browser sessions (current first) + the active Stremio token as "Stremio · Android TV · N ngày trước · qua link addon". */
export function sessionRows(userId: number, sessionId: string, now = new Date()): SessionRow[] {
  const s = copy.settings.sessions;
  const rows: SessionRow[] = listSessions(userId, sessionId)
    .sort((a, b) => Number(b.current) - Number(a.current) || Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt))
    .map((x) => ({ id: x.id, label: x.deviceLabel, detail: x.current ? s.thisDevice : formatRelativeVi(new Date(x.lastSeenAt), now), current: x.current, kind: "session" }));
  const token = describeDeviceToken(userId);
  if (!token.revoked && token.token) rows.push({ id: `stremio:${token.token.slice(0, 6)}`, label: s.stremioDevice, detail: `${formatRelativeVi(new Date(token.lastUsedAt ?? token.createdAt ?? now.toISOString()), now)} · ${s.viaAddon}`, current: false, kind: "stremio" });
  return rows;
}
