import type { ReactNode } from "react";
import { cx } from "@/lib/format/class-names";
import { copy } from "@/lib/copy-vi";

/**
 * `.auth > .form > .logo + children` — login, invite and onboarding share this card.
 * `gate` renders it as a full-screen overlay above the app shell (onboarding).
 */
export function AuthCard({ children, gate }: { children: ReactNode; gate?: boolean }) {
  return (
    <div className={cx("auth", gate && "gate")}>
      <div className="form">
        <div className="logo" style={{ fontSize: 24, marginBottom: 24 }}>
          {copy.app.name}
        </div>
        {children}
      </div>
    </div>
  );
}
