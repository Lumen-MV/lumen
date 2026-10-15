// `npm run db:migrate` — opens the SQLite file, applies pending ./drizzle migrations, enables WAL.
import "./load-env";

async function main() {
  const { getDb } = await import("@/lib/db/sqlite-client");
  getDb();
  console.log("Migrations applied.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
