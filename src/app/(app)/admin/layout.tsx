import { AdminTabs } from "@/components/admin/admin-tabs";
import { ForbiddenView } from "@/components/ui/forbidden-view";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { copy } from "@/lib/copy-vi";

export const dynamic = "force-dynamic";

/** Role guard + admin shell (`.admin > h1 + .atabs + page`) for /admin/*: members see the 403 box inside the normal shell. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await getSessionUser();
  if (me?.user.role !== "admin") return <ForbiddenView />;
  return (
    <div className="admin">
      <h1>{copy.admin.title}</h1>
      <AdminTabs />
      {children}
    </div>
  );
}
