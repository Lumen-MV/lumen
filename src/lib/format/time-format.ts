import { copy } from "@/lib/copy-vi";

const pad2 = (n: number) => String(n).padStart(2, "0");

/** 5228 → "1:27:08"; 312 → "5:12" (player clock). */
export function formatClock(totalS: number): string {
  const s = Math.max(0, Math.floor(totalS));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(sec)}` : `${m}:${pad2(sec)}`;
}

/** 292 → "4:52" (rate-limit countdown). */
export function formatCountdown(totalS: number): string {
  const s = Math.max(0, Math.ceil(totalS));
  return `${Math.floor(s / 60)}:${pad2(s % 60)}`;
}

/** 148 → "2h 28m" (TMDB runtime, English style used by the mockup cards). */
export function formatRuntimeEn(minutes: number): string {
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** 76 → "1g 16p" (Vietnamese short form). */
export function formatRuntimeVi(minutes: number): string {
  return `${Math.floor(minutes / 60)}g ${minutes % 60}p`;
}

/** dd/mm/yyyy */
export function formatDate(d: Date): string {
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** dd/mm — used by the "Link mời đã được dùng" text. */
export function formatDayMonth(d: Date): string {
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;
}

/** "YYYY-MM-DD" (TMDB air/release dates) → local-midnight Date; `new Date(iso)` would be UTC midnight and show the previous day west of UTC. */
export function parseLocalDate(iso: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "Vừa xong" / "2 phút trước" / "3 giờ trước" / "Hôm qua" / "5 ngày trước" / dd/mm/yyyy */
export function formatRelativeVi(d: Date, now = new Date()): string {
  const diffS = Math.max(0, (now.getTime() - d.getTime()) / 1000);
  if (diffS < 60) return copy.time.justNow;
  if (diffS < 3600) return copy.time.minutesAgo(Math.floor(diffS / 60));
  if (diffS < 86400) return copy.time.hoursAgo(Math.floor(diffS / 3600));
  const days = Math.floor(diffS / 86400);
  if (days === 1) return copy.time.yesterday;
  if (days < 30) return copy.time.daysAgo(days);
  return formatDate(d);
}

export const DAY_MS = 86_400_000;
export const daysBetweenCeil = (from: Date, to: Date) => Math.ceil((to.getTime() - from.getTime()) / DAY_MS);
