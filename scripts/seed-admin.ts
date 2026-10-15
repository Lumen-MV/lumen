// `npm run seed` — idempotent: creates the ADMIN_USERNAME account when no admin exists.
// `npm run seed -- --reset-password` — additionally resets that admin's password to ADMIN_PASSWORD.
import "./load-env";

async function main() {
  const { getEnv } = await import("@/lib/config/env");
  getEnv();
  const { seedAdminFromEnv, resetAdminPasswordFromEnv } = await import("@/lib/users/user-service");
  const r = await seedAdminFromEnv();
  console.log(r.created ? `Admin "${r.username}" created.` : `Admin "${r.username}" already exists; nothing to do.`);
  if (process.argv.includes("--reset-password")) console.log(`Password reset for admin "${await resetAdminPasswordFromEnv()}".`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
