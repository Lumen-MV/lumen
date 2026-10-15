import Link from "next/link";
import { copy } from "@/lib/copy-vi";
import { formatDayMonth } from "@/lib/format/time-format";
import type { InviteValidation } from "@/lib/invites/invite-service";

type Broken = Exclude<InviteValidation, { state: "valid" }>;

/** `h2 + p + .btn.w` for used / expired / invalid invite links (server component). */
export function InviteBroken({ validation }: { validation: Broken }) {
  const c = copy.invite;
  const view =
    validation.state === "used"
      ? { title: c.used.title, text: c.used.text(validation.usedBy, formatDayMonth(new Date(validation.usedAt))), action: c.used.action }
      : validation.state === "expired"
        ? { title: c.expired.title, text: c.expired.text(validation.expiredDaysAgo), action: c.expired.action }
        : { title: c.invalid.title, text: c.invalid.text, action: c.invalid.action };
  return (
    <>
      <h2>{view.title}</h2>
      <p style={{ color: "#bbb", lineHeight: 1.5 }}>{view.text}</p>
      <Link href="/login" className="btn w" style={{ width: "100%", justifyContent: "center" }}>
        {view.action}
      </Link>
    </>
  );
}
