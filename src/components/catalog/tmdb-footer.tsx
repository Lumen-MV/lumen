import { copy } from "@/lib/copy-vi";

/** `footer` — TMDB attribution (ToS) + member count + version, verbatim from screen-home.js. */
export function TmdbFooter({ memberCount }: { memberCount: number }) {
  return <footer>{copy.home.footer(memberCount, copy.app.version)}</footer>;
}
