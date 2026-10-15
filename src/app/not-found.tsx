import { AppHeader } from "@/components/ui/app-header";
import { NotFoundView } from "@/components/ui/forbidden-view";
import { getSessionUser } from "@/lib/auth/get-session-user";

/** Root 404 (unmatched URLs): shows the app header when a session exists, else just the empty box. */
export default async function NotFound() {
  const me = await getSessionUser().catch(() => null);
  return (
    <>
      {me && <AppHeader user={me.user} active={null} />}
      <NotFoundView />
    </>
  );
}
