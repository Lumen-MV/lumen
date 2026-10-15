import type { TmdbContentRatings, TmdbReleaseDates } from "./tmdb-types";

/**
 * Age pill label. Movies: `release_dates` VN certification first, then US (R→18+, PG-13→16+, PG→13+).
 * TV: `content_ratings` VN first, then US (TV-MA→18+, TV-14→16+, TV-PG/TV-G→13+). Default "16+" (the mockup value).
 */
export const DEFAULT_AGE = "16+";

const US_MOVIE: Record<string, string> = { "NC-17": "18+", R: "18+", "PG-13": "16+", PG: "13+", G: "P" };
const US_TV: Record<string, string> = { "TV-MA": "18+", "TV-14": "16+", "TV-PG": "13+", "TV-G": "P", "TV-Y7": "P", "TV-Y": "P" };

/** VN board labels: T18/T16/T13 → "18+"/"16+"/"13+", C (cấm) → 18+, K/P (phổ biến) → "P". */
export function mapVnCertification(cert: string): string | null {
  const c = cert.trim().toUpperCase();
  const m = c.match(/^T(\d{2})$/);
  if (m) return `${m[1]}+`;
  if (c === "C" || c === "18+") return "18+";
  if (c === "16+" || c === "13+") return c;
  if (c === "K" || c === "P") return "P";
  return null;
}

function pickCert(certs: Array<{ country: string; cert: string }>, usMap: Record<string, string>): string {
  const vn = certs.find((c) => c.country === "VN" && c.cert);
  if (vn) {
    const mapped = mapVnCertification(vn.cert);
    if (mapped) return mapped;
  }
  const us = certs.find((c) => c.country === "US" && c.cert);
  if (us) return usMap[us.cert.trim().toUpperCase()] ?? DEFAULT_AGE;
  return DEFAULT_AGE;
}

export function movieAgeLabel(releaseDates: TmdbReleaseDates | undefined): string {
  const certs = (releaseDates?.results ?? []).flatMap((r) =>
    r.release_dates.filter((d) => d.certification).map((d) => ({ country: r.iso_3166_1, cert: d.certification })),
  );
  return pickCert(certs, US_MOVIE);
}

export function tvAgeLabel(ratings: TmdbContentRatings | undefined): string {
  const certs = (ratings?.results ?? []).filter((r) => r.rating).map((r) => ({ country: r.iso_3166_1, cert: r.rating }));
  return pickCert(certs, US_TV);
}
