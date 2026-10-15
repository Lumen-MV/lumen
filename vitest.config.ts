import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // `server-only` throws when imported outside Next's RSC bundle → stub it for tests
  resolve: { alias: { "@": path.resolve(__dirname, "src"), "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts") } },
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
});
