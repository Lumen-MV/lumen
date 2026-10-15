/**
 * Temp-password enforcement (admin "Đặt lại mật khẩu" / "Gửi lại link"): while `must_change_password` is set, the member
 * may only reach the settings page (password section), read their own profile, change the password and log out. Pure
 * (client-safe) so the server layout, the API guards and the unit tests share one allowlist.
 */
export const PASSWORD_CHANGE_PATH = "/settings?tab=profile";
const ALLOWED_PAGES = [/^\/settings$/];
const ALLOWED_APIS = [/^\/api\/me$/, /^\/api\/me\/password$/, /^\/api\/auth\/logout$/];

/** True when a user who still has to change the temp password must be blocked from `pathname`. */
export function passwordChangeBlocks(mustChangePassword: boolean, pathname: string): boolean {
  if (!mustChangePassword) return false;
  const rules = pathname.startsWith("/api/") ? ALLOWED_APIS : ALLOWED_PAGES;
  return !rules.some((re) => re.test(pathname));
}
