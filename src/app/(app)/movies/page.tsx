import { BrowsePage } from "@/components/catalog/browse-page";

export const dynamic = "force-dynamic";

/** /movies — "Phim lẻ" browse (discover movie). */
export default function MoviesPage() {
  return <BrowsePage type="movie" />;
}
