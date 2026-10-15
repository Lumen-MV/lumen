import { copy } from "@/lib/copy-vi";
import { formatDayMonth } from "@/lib/format/time-format";

/** Pure rules for the admin "Nhật ký": chip → kinds, month window, time label, name bolding, CSV. Client-safe (no db). */
export type ActivityKind = "login" | "join" | "invite" | "view" | "cloud" | "translate" | "admin";
export type ActivityFilter = (typeof copy.admin.activity.filterKinds)[number];
export type ActivityEntry = { id: number; kind: ActivityKind; userId: number | null; userName: string; time: string; html: string; createdAt: string };

const KINDS: Record<ActivityFilter, ActivityKind[] | null> = { all: null, view: ["view"], cloud: ["cloud"], translate: ["translate"], login: ["login"], invite: ["invite", "join"] };

export function kindsForFilter(filter: ActivityFilter): ActivityKind[] | null {
  return KINDS[filter];
}

export const isActivityFilter = (raw: string | null | undefined): raw is ActivityFilter => (copy.admin.activity.filterKinds as readonly string[]).includes(raw ?? "");

/** `YYYY-MM` → [start, end) local; anything else → null (no month restriction). */
export function monthWindow(raw: string | null | undefined): { from: Date; to: Date } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(raw ?? "");
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]) - 1;
  if (mo < 0 || mo > 11) return null;
  return { from: new Date(y, mo, 1), to: new Date(y, mo + 1, 1) };
}

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** "08:31" today · "Hôm qua 23:10" · "13/10" older (mockup timeline labels). */
export function activityTimeLabel(d: Date, now = new Date()): string {
  if (sameDay(d, now)) return hhmm(d);
  if (sameDay(d, new Date(now.getTime() - 86_400_000))) return copy.admin.activity.yesterday(hhmm(d));
  return formatDayMonth(d);
}

/** Rows written before Phase 6 are plain text: bold the leading display name so every row reads like the mockup. */
export function boldActorName(text: string, userName: string): string {
  if (text.includes("<b>") || !userName || !text.startsWith(userName)) return text;
  return `<b>${userName}</b>${text.slice(userName.length)}`;
}

const stripBold = (s: string) => s.replace(/<\/?b>/g, "");
/** A cell starting with = + - @ or a tab / CR would run as a formula in Excel / Sheets: prefix it with an apostrophe. */
export const csvCell = (raw: string): string => {
  const s = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function activityCsv(entries: ActivityEntry[]): string {
  const lines = [copy.admin.activity.csvHeader.join(",")];
  for (const e of entries) lines.push([e.createdAt, e.kind, e.userName, stripBold(e.html)].map(csvCell).join(","));
  return `﻿${lines.join("\r\n")}\r\n`;
}
