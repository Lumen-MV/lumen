import { BrowsePage } from "@/components/catalog/browse-page";

export const dynamic = "force-dynamic";

/** /series — "Phim bộ" browse (discover tv). */
export default function SeriesBrowsePage() {
  return <BrowsePage type="tv" />;
}
