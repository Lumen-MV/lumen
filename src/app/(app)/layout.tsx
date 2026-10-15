import { redirect } from "next/navigation";
import { AppHeader } from "@/components/ui/app-header";
import { MobileTabBar } from "@/components/ui/mobile-tab-bar";
import { OnboardingDialog } from "@/components/ui/onboarding-dialog";
import { KeyboardHelpHotkey } from "@/components/ui/keyboard-help-dialog";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { PASSWORD_CHANGE_PATH, passwordChangeBlocks } from "@/lib/auth/password-change-gate";
import { requestPathname } from "@/lib/auth/require-admin";
import { countUnreadNotifications } from "@/lib/notifications/count-unread";

export const dynamic = "force-dynamic";

/** Authenticated shell: header + mobile tab bar + onboarding gate + `?` help. Middleware already checked the cookie; a temp password pins the member to /settings until it is changed. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  if (passwordChangeBlocks(me.user.mustChangePassword, await requestPathname())) redirect(PASSWORD_CHANGE_PATH);
  return (
    <>
      <AppHeader user={me.user} unread={countUnreadNotifications(me.user.id)} />
      {children}
      <MobileTabBar />
      {!me.user.onboarded && <OnboardingDialog user={me.user} />}
      <KeyboardHelpHotkey />
    </>
  );
}
