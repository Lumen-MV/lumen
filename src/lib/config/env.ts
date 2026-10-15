import "server-only";
import { z } from "zod";

/**
 * Server-only env validation (the `server-only` import makes any client-graph import a build error).
 * Secrets never reach the client (no NEXT_PUBLIC_ prefix).
 * Only auth-critical keys are required in Phase 1; API keys for later phases may stay empty in dev.
 */
const optionalStr = z.string().optional().default("");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_URL: z.url().default("http://localhost:3000"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  ADMIN_USERNAME: z.string().min(3).max(20),
  ADMIN_PASSWORD: z.string().min(8),
  ADMIN_DISPLAY_NAME: z.string().default("Admin"),
  TMDB_READ_TOKEN: optionalStr,
  TORBOX_API_KEY: optionalStr,
  TORRENTIO_BASE: z.string().default("https://torrentio.strem.fun"),
  OPENSUBTITLES_API_KEY: optionalStr,
  OPENSUBTITLES_USER: optionalStr,
  OPENSUBTITLES_PASS: optionalStr,
  SUBDL_API_KEY: optionalStr,
  TRANSLATOR: z.enum(["kie", "deepseek", "claude"]).default("kie"),
  KIE_API_KEY: optionalStr,
  KIE_BASE_URL: z.string().default("https://api.kie.ai"),
  KIE_MODEL: z.string().default("deepseek-v4-1-flash"),
  DEEPSEEK_API_KEY: optionalStr,
  DEEPSEEK_MODEL: z.string().default("deepseek-chat"),
  ANTHROPIC_API_KEY: optionalStr,
  FFMPEG_PATH: z.string().default("ffmpeg"),
  FFPROBE_PATH: z.string().default("ffprobe"),
  DATA_DIR: z.string().default("./data"),
  MAX_CONCURRENT_VIEWERS: z.coerce.number().int().positive().default(5),
  // direct: <video src> = TorBox CDN URL (VM egress ≈ 0, key visible to viewers); proxy: /api/play/stream/[id] pipes the CDN with Range
  STREAM_MODE: z.enum(["direct", "proxy"]).default("direct"),
  MAX_CLOUD_JOBS: z.coerce.number().int().positive().default(6),
  DEFAULT_QUALITY: z.enum(["1080p", "2160p"]).default("1080p"),
  LUMEN_SCENARIOS: z.enum(["0", "1"]).default("0"),
  // 0 = no background title_sources sweeper (dev / QA runs that must not call TorBox behind the scripts)
  LUMEN_SWEEPER: z.enum(["0", "1"]).default("1"),
  // 1 only behind a reverse proxy that rewrites x-forwarded-for (Caddy in docker-compose)
  TRUST_PROXY: z.enum(["0", "1"]).default("0"),
  APP_VERSION: z.string().default("1.0"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

/** Parses process.env once; throws a single error listing every missing/invalid key. */
export function getEnv(): Env {
  if (cached) return cached;
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `${i.path.join(".") || "?"}: ${i.message}`);
    throw new Error(`Invalid environment (.env.local):\n  - ${problems.join("\n  - ")}`);
  }
  cached = result.data;
  return cached;
}

export const isProd = () => getEnv().NODE_ENV === "production";
export const devScenariosEnabled = () => getEnv().LUMEN_SCENARIOS === "1" && !isProd();
