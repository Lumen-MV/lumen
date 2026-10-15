import { defineConfig } from "drizzle-kit";

// `npm run db:generate` writes SQL migrations into ./drizzle from src/lib/db/schema.ts.
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: `${process.env.DATA_DIR ?? "./data"}/lumen.sqlite` },
});
