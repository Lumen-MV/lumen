/**
 * Cheap 0-100 strength score shared by the invite form meter and the accept-invite route.
 * Thresholds (mockup): < 40 "yếu" (red), < 75 "khá" (amber), else "mạnh" (green).
 */
export const MIN_PASSWORD_LENGTH = 8;

export function scorePassword(pw: string): number {
  if (!pw) return 0;
  let score = Math.min(60, pw.length * 5);
  if (/[a-z]/.test(pw)) score += 8;
  if (/[A-Z]/.test(pw)) score += 12;
  if (/\d/.test(pw)) score += 12;
  if (/[^A-Za-z0-9]/.test(pw)) score += 16;
  if (/^(.)\1+$/.test(pw) || /^(0123|1234|abcd|qwer|pass)/i.test(pw)) score -= 25;
  return Math.max(0, Math.min(100, score));
}

export type StrengthLevel = "weak" | "fair" | "strong";

export function strengthLevel(score: number): StrengthLevel {
  return score < 40 ? "weak" : score < 75 ? "fair" : "strong";
}

export function strengthColor(score: number): string {
  return score < 40 ? "#e50914" : score < 75 ? "#f59e0b" : "#46d369";
}

export function isPasswordAcceptable(pw: string): boolean {
  return pw.length >= MIN_PASSWORD_LENGTH;
}
