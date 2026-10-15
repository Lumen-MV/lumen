import type { CSSProperties, ReactNode } from "react";
import { cx } from "@/lib/format/class-names";

export type TagKind = "g" | "b" | "b-outline" | "o" | "x" | "blue" | "red" | "grey-outline";

/** Inline styles mirror the one-off styles used in global.html for the outline/fill variants; `grey-outline` = picker "Lần trước". */
const STYLE: Partial<Record<TagKind, CSSProperties>> = {
  "b-outline": { background: "none", border: "1px solid #2d6cdf" },
  blue: { background: "#2d6cdf" },
  red: { background: "#e50914" },
  "grey-outline": { background: "none", border: "1px solid #777", color: "#bbb" },
};

/** `.tag.g` Đã cache · `.tag.x` Chưa cache · `.tag.b` Phát trực tiếp · outline Chrome/Android · `.tag.o` Cần app · fill blue/red · grey outline Lần trước. */
export function Tag({ kind, children }: { kind: TagKind; children: ReactNode }) {
  const cls = cx("tag", kind === "g" && "g", (kind === "b" || kind === "b-outline") && "b", kind === "o" && "o", kind === "x" && "x");
  return (
    <span className={cls} style={STYLE[kind]}>
      {children}
    </span>
  );
}
