import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker runner copies .next/standalone (see Dockerfile).
  output: "standalone",
  // Native module must stay external to the server bundle.
  serverExternalPackages: ["better-sqlite3"],
  // The floating "N" dev badge would show up in mockup-comparison screenshots.
  devIndicators: false,
  // no framework banner on responses (Caddy also strips `Server`)
  poweredByHeader: false,
  // Private app: never indexed; baseline security headers even without Caddy (`next start` on the LAN).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
