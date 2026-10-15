import Link from "next/link";
import { Button } from "./button";
import { copy } from "@/lib/copy-vi";

type Props = { title: string; hint: string; actionLabel?: string; actionHref?: string; onAction?: () => void };

/** `.emptybox > .emptyico + .emptytitle + .emptyhint + .btn.sm.w` — used by 403/404 and empty lists. */
export function EmptyBox({ title, hint, actionLabel, actionHref, onAction }: Props) {
  return (
    <div className="emptybox">
      <div className="emptyico">{copy.common.emptyGlyph}</div>
      <div className="emptytitle">{title}</div>
      <div className="emptyhint">{hint}</div>
      {actionLabel && actionHref && (
        <Link href={actionHref} className="btn sm w">
          {actionLabel}
        </Link>
      )}
      {actionLabel && !actionHref && (
        <Button size="sm" variant="white" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
