import { redirect } from "next/navigation";
import { Suspense } from "react";
import { HomeRowSkeleton } from "@/components/catalog/row-skeleton";
import { MyListPage } from "@/components/my-list/my-list-page";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { listMyList } from "@/lib/my-list/my-list-store";
import { listContinue } from "@/lib/progress/continue-list";

export const dynamic = "force-dynamic";

/** Both lists need one TMDB detail per row (3-day cache): they stream in behind Suspense so a cold cache never stalls the shell. */
async function MyListBody({ userId }: { userId: number }) {
  const [continueItems, items] = await Promise.all([
    listContinue(userId).catch((err: unknown) => {
      console.warn("[my-list] continue", err instanceof Error ? err.message : err);
      return [];
    }),
    listMyList(userId).catch((err: unknown) => {
      console.warn("[my-list] list", err instanceof Error ? err.message : err);
      return [];
    }),
  ]);
  return <MyListPage continueItems={continueItems} items={items} />;
}

/** /my-list — "Tiếp tục xem" + "Danh sách của tôi" (my-list.html). Server-rendered lists (streamed); the client page owns filter / sort / bulk / undo. */
export default async function MyListRoute() {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  return (
    <Suspense
      fallback={
        <main data-my-list data-loading="true">
          <div style={{ marginTop: 20 }}>
            <HomeRowSkeleton titleWidth={180} n={6} wide />
          </div>
          <HomeRowSkeleton titleWidth={240} n={8} />
        </main>
      }
    >
      <MyListBody userId={me.user.id} />
    </Suspense>
  );
}
