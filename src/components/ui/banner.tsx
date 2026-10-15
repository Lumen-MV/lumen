import type { CSSProperties, ReactNode } from "react";
import { Button } from "./button";

type Props = { kind: "warn" | "err" | "info"; children: ReactNode; action?: { label: string; onClick: () => void }; style?: CSSProperties };

/** `.banner.warn|.err|.info` with optional right-aligned `.btn.sm`. */
export function Banner({ kind, children, action, style }: Props) {
  return (
    <div className={`banner ${kind}`} style={style} role="status">
      {children}
      {action && (
        <Button size="sm" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
