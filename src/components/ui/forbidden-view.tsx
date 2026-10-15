import { EmptyBox } from "./empty-box";
import { copy } from "@/lib/copy-vi";

/** 403 body (`.demo > .emptybox`), used by /forbidden and inline by the admin layout. */
export function ForbiddenView() {
  return (
    <div className="demo">
      <EmptyBox title={copy.forbidden.title} hint={copy.forbidden.hint} actionLabel={copy.common.backHome} actionHref="/" />
    </div>
  );
}

/** 404 body with the same layout. */
export function NotFoundView() {
  return (
    <div className="demo">
      <EmptyBox title={copy.notFound.title} hint={copy.notFound.hint} actionLabel={copy.common.backHome} actionHref="/" />
    </div>
  );
}
