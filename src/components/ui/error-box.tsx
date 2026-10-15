import { Button } from "./button";
import { copy } from "@/lib/copy-vi";

type Props = { message: string; actionLabel?: string; onAction?: () => void };

/** `.errbox > .errico + (.errmsg + .btn.sm)` — inline error with retry (mockup errorBox helper). */
export function ErrorBox({ message, actionLabel = copy.common.retry, onAction }: Props) {
  return (
    <div className="errbox" role="alert">
      <div className="errico">{copy.common.errorGlyph}</div>
      <div>
        <div className="errmsg">{message}</div>
        <Button size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      </div>
    </div>
  );
}
