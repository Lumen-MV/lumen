import type { ReactNode } from "react";

/** `.st.ok|.off|.wait` pill (admin tables). */
export function StatusChip({ kind, children }: { kind: "ok" | "off" | "wait"; children: ReactNode }) {
  return <span className={`st ${kind}`}>{children}</span>;
}
