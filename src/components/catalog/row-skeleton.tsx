import { RowSkeleton } from "@/components/ui/skeletons";

/** Home `loading` state: a title bar (180/240/200×20 #2a2a2a) above `.row` of `.card.sk` (6 wide, 8, 8) — exactly like screen-home.js. */
export function HomeRowSkeleton({ titleWidth, n, wide = false }: { titleWidth: number; n: number; wide?: boolean }) {
  return (
    <section aria-hidden="true">
      <div className="h">
        <h2 style={{ width: titleWidth, height: 20, background: "#2a2a2a", borderRadius: 3 }} />
      </div>
      <RowSkeleton n={n} wide={wide} />
    </section>
  );
}
