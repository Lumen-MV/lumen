import { copy } from "@/lib/copy-vi";

/**
 * Session labels ("Chrome · Windows", "Safari · iPhone") → the admin "Thiết bị" column words ("PC", "iPhone", …).
 * Pure; the Stremio device token adds "Android TV (Stremio)". Order of first appearance, deduped.
 */
export function shortDeviceName(deviceLabel: string): string {
  const d = copy.admin.members.devices;
  const os = deviceLabel.split("·").pop()?.trim().toLowerCase() ?? "";
  if (/ipad/.test(os)) return d.ipad;
  if (/iphone|ios/.test(os)) return d.iphone;
  if (/windows/.test(os)) return d.pc;
  if (/mac/.test(os)) return d.mac;
  if (/android tv|google tv/.test(os)) return d.androidTv;
  if (/android/.test(os)) return d.android;
  return d.other;
}

const MAX_NAMES = 3;

/** "PC, iPhone, Android TV (Stremio)" — unknown UAs last, at most 3 names then "+N" so the row never overflows the table. */
export function deviceSummary(sessionLabels: string[], hasStremio: boolean): string {
  const d = copy.admin.members.devices;
  const names = [...new Set(sessionLabels.map(shortDeviceName))].sort((a, b) => Number(a === d.other) - Number(b === d.other));
  if (hasStremio) names.unshift(d.stremio);
  if (!names.length) return copy.admin.members.noDevice;
  const shown = names.slice(0, MAX_NAMES);
  return names.length > MAX_NAMES ? `${shown.join(", ")} +${names.length - MAX_NAMES}` : shown.join(", ");
}
