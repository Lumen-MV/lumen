import { RowSkeleton } from "@/components/ui/skeletons";
import { cx } from "@/lib/format/class-names";

const block = (w: number | string, h: number, extra: React.CSSProperties = {}) => ({ width: w, height: h, background: "#2a2a2a", borderRadius: 4, ...extra });

/** detail.html `skeleton`: `.detail(#1a1a1a) > .in` title 520×54, buttons 150×42 + 2 circles 42, lines 640/560×14, then a RowSkeleton(8). */
export function DetailSkeleton({ variant = "movie" }: { variant?: "movie" | "series" }) {
  return (
    <main aria-hidden="true">
      <div className={cx("detail", variant === "series" && "series")} style={{ background: "#1a1a1a" }}>
        <div className="in">
          <div style={block(520, 54, { marginBottom: 16 })} />
          <div style={{ display: "flex", gap: 10, marginBottom: 26 }}>
            <div style={block(150, 42)} />
            <div style={block(42, 42, { borderRadius: "50%" })} />
            <div style={block(42, 42, { borderRadius: "50%" })} />
          </div>
          <div style={block(640, 14, { borderRadius: 3, marginBottom: 8 })} />
          <div style={block(560, 14, { borderRadius: 3 })} />
        </div>
      </div>
      <section>
        <RowSkeleton n={8} />
      </section>
    </main>
  );
}
