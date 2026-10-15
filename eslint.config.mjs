import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // Posters/backdrops/stills are hotlinked from image.tmdb.org exactly like the mockup (TMDB's intended use);
    // next/image would route every image through the VM (egress + CPU) for no visual gain.
    rules: { "@next/next/no-img-element": "off" },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      // gitignored screenshot / scratch output of the QA runs (tests/qa-*.mjs stay linted)
      "qa/**",
      // CommonJS one-off migration runner that runs inside the Docker image (no TS / ESM toolchain there)
      "infra/migrate.cjs",
    ],
  },
];

export default eslintConfig;
