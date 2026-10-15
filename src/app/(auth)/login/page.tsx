import { redirect } from "next/navigation";
import { AuthCard } from "@/components/ui/auth-card";
import { LoginForm } from "@/components/auth/login-form";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { safeNextPath } from "@/lib/auth/safe-next-path";

export const dynamic = "force-dynamic";

/** /login — redirects home when a live session already exists. `?next=` is reduced to a same-origin path before it reaches the form. */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const me = await getSessionUser();
  if (me) redirect("/");
  const { next } = await searchParams;
  const safeNext = safeNextPath(next);
  return (
    <AuthCard>
      <LoginForm next={safeNext === "/" ? undefined : safeNext} />
    </AuthCard>
  );
}
