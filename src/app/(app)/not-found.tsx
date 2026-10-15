import { NotFoundView } from "@/components/ui/forbidden-view";

/** 404 inside the app shell (notFound() from any (app) page, e.g. a TMDB id that no longer exists). */
export default function AppNotFound() {
  return <NotFoundView />;
}
