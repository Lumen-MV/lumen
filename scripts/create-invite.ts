// `npm run invite -- [--note "Bảo"] [--days 3|7|14] [--multi]` — prints a one-time invite URL created by the admin.
import "./load-env";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const { getEnv } = await import("@/lib/config/env");
  getEnv();
  const { seedAdminFromEnv, findUserByUsername } = await import("@/lib/users/user-service");
  const { createInvite } = await import("@/lib/invites/invite-service");
  const { logActivity } = await import("@/lib/activity/log-activity");
  const { copy } = await import("@/lib/copy-vi");

  const admin = findUserByUsername((await seedAdminFromEnv()).username);
  if (!admin) throw new Error("admin user not found");
  const daysRaw = Number(arg("days") ?? 7);
  const expiresDays = daysRaw === 3 || daysRaw === 14 ? daysRaw : 7;
  const inv = createInvite({ createdBy: admin.id, note: arg("note") ?? "", expiresDays, maxUses: process.argv.includes("--multi") ? null : 1 });
  logActivity("invite", copy.activity.inviteCreated(admin.displayName, "CLI"), admin.id);
  console.log(`Invite #${inv.id} (expires ${inv.expiresAt}):`);
  console.log(inv.url);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
