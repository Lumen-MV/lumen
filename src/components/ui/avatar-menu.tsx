"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogoutConfirmDialog, type ActiveJobSummary } from "@/components/sources/logout-confirm-dialog";
import { DropdownMenu, type MenuItem } from "./dropdown-menu";
import { copy } from "@/lib/copy-vi";
import type { PublicUser } from "@/lib/users/user-service";

/** `.avatar` letter tile → `.menu2` with Cài đặt / Quản trị (admin) / Đăng xuất. An active cloud job asks "Đăng xuất?" first. */
export function AvatarMenu({ user }: { user: PublicUser }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<ActiveJobSummary | null>(null);
  const logout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch (err) {
      console.error("[logout]", err);
    }
    window.location.assign("/login");
  };
  const askLogout = async () => {
    try {
      const me = (await (await fetch("/api/me")).json()) as { activeCloudJobs?: number; activeJob?: ActiveJobSummary | null };
      if ((me.activeCloudJobs ?? 0) > 0 && me.activeJob) return setConfirm(me.activeJob);
    } catch (err) {
      console.warn("[logout] /api/me", err); // handled: fall through to a plain logout
    }
    await logout();
  };
  const items: MenuItem[] = [
    { label: copy.avatarMenu.settings, onSelect: () => router.push("/settings") },
    ...(user.role === "admin" ? [{ label: copy.avatarMenu.admin, onSelect: () => router.push("/admin") }] : []),
    { label: "", sep: true },
    { label: copy.avatarMenu.logout, onSelect: () => void askLogout() },
  ];
  const initial = (user.displayName || user.username).trim().charAt(0).toUpperCase();
  return (
    <>
      <DropdownMenu
        items={items}
        anchor={
          <span className="avatar" style={{ background: user.avatarColor, cursor: "pointer" }} role="button" tabIndex={0} aria-label={user.displayName}>
            {initial}
          </span>
        }
      />
      <LogoutConfirmDialog job={confirm} onStay={() => setConfirm(null)} onLogout={() => void logout()} />
    </>
  );
}
