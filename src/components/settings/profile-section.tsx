"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast-provider";
import { copy } from "@/lib/copy-vi";
import type { PublicUser } from "@/lib/users/user-service";
import { AvatarColorSwatches } from "./avatar-color-swatches";
import { ChangePasswordForm } from "./change-password-form";
import { SettingsField, SettingsSection } from "./settings-shell";
import { useSavedFlash } from "./use-settings-patch";

const rowStyle = { display: "flex", gap: 8, alignItems: "center" } as const;

async function patchProfile(body: Record<string, string>): Promise<PublicUser> {
  const res = await fetch("/api/me/profile", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`PATCH /api/me/profile ${res.status}`);
  return ((await res.json()) as { user: PublicUser }).user;
}

/** Hồ sơ: display name (Lưu → "Đã lưu ✓" 2 s), read-only username, 8 swatches, role, then the Đổi mật khẩu section. */
export function ProfileSection({ user }: { user: PublicUser }) {
  const router = useRouter();
  const { toast } = useToast();
  const p = copy.settings.profile;
  const [name, setName] = useState(user.displayName);
  const [color, setColor] = useState(user.avatarColor);
  const [busy, setBusy] = useState(false);
  const [saved, flash] = useSavedFlash();

  const saveName = async (e: FormEvent) => {
    e.preventDefault();
    const next = name.trim();
    if (!next) return void toast({ type: "err", text: p.nameEmpty });
    setBusy(true);
    try {
      const u = await patchProfile({ displayName: next });
      setName(u.displayName);
      flash();
      router.refresh(); // header avatar / admin name follow
    } catch (err) {
      console.error("[profile]", err);
      toast({ type: "err", text: copy.settings.errToast });
    } finally {
      setBusy(false);
    }
  };
  const pickColor = async (c: string) => {
    const previous = color;
    setColor(c);
    try {
      await patchProfile({ avatarColor: c });
      router.refresh();
    } catch (err) {
      console.error("[profile colour]", err);
      setColor(previous);
      toast({ type: "err", text: copy.settings.errToast });
    }
  };

  return (
    <>
      <SettingsSection title={copy.settings.nav[0]} desc={p.desc}>
        <SettingsField label={p.displayName}>
          <form style={rowStyle} onSubmit={saveName} data-field="display-name">
            <input value={name} maxLength={40} aria-label={p.displayName} onChange={(e) => setName(e.target.value)} />
            <Button size="sm" type="submit" loading={busy}>
              {copy.common.save}
            </Button>
            {saved && <span className="saved">{copy.common.saved}</span>}
          </form>
        </SettingsField>
        <SettingsField label={p.username} hint={p.usernameHint}>
          <div style={{ color: "#888" }}>{user.username}</div>
        </SettingsField>
        <SettingsField label={p.color}>
          <AvatarColorSwatches value={color} onChange={(c) => void pickColor(c)} label={p.color} />
        </SettingsField>
        <SettingsField label={p.role}>
          <div>{user.role === "admin" ? p.admin : p.member}</div>
        </SettingsField>
      </SettingsSection>
      <ChangePasswordForm mustChange={user.mustChangePassword} />
    </>
  );
}
