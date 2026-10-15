import type { ReactNode } from "react";

/** `.pill` — HD, 4K, 16+, EN. */
export function Pill({ children }: { children: ReactNode }) {
  return <span className="pill">{children}</span>;
}
