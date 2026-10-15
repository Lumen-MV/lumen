"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast-provider";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password-strength";
import { copy } from "@/lib/copy-vi";
import { SettingsField, SettingsSection } from "./settings-shell";

type PwError = "wrong" | "short" | "mismatch" | null;
const errStyle = { color: "#f0a0a0", fontSize: 13, margin: "10px 0" } as const;
const badOutline = { outline: "2px solid #e50914" } as const;

/**
 * Đổi mật khẩu: three password fields; "Mật khẩu hiện tại không đúng." (red outline on the current field, `400 PW_WRONG`),
 * too short / mismatch are checked before the request. A temp password (`mustChange`) shows the note above the form.
 */
export function ChangePasswordForm({ mustChange }: { mustChange: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const p = copy.settings.profile;
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<PwError>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(mustChange);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!current) return setError("wrong");
    if (next.length < MIN_PASSWORD_LENGTH) return setError("short");
    if (next !== repeat) return setError("mismatch");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/me/password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ current, next }) });
      if (res.status === 400) {
        const data = (await res.json().catch(() => ({}))) as { code?: string };
        setError(data.code === "WEAK_PASSWORD" ? "short" : "wrong");
        return;
      }
      if (!res.ok) throw new Error(`POST /api/me/password ${res.status}`);
      setCurrent("");
      setNext("");
      setRepeat("");
      setNote(false);
      toast({ type: "success", text: p.pwDone });
      router.refresh();
    } catch (err) {
      console.error("[password]", err);
      toast({ type: "err", text: copy.settings.errToast });
    } finally {
      setBusy(false);
    }
  };
  const message = error === "wrong" ? p.pwWrong : error === "short" ? p.pwShort : error === "mismatch" ? p.pwMismatch : null;

  return (
    <SettingsSection title={p.pwTitle}>
      {note && (
        <p className="d" style={{ color: "#f0d79b" }} data-must-change>
          {p.pwMustChange}
        </p>
      )}
      <form onSubmit={submit} data-form="password">
        <SettingsField label={p.pwCurrent}>
          <input type="password" autoComplete="current-password" aria-label={p.pwCurrent} value={current} style={error === "wrong" ? badOutline : undefined} onChange={(e) => setCurrent(e.target.value)} />
        </SettingsField>
        <SettingsField label={p.pwNew} hint={p.pwNewHint}>
          <input type="password" autoComplete="new-password" aria-label={p.pwNew} value={next} style={error === "short" ? badOutline : undefined} onChange={(e) => setNext(e.target.value)} />
        </SettingsField>
        <SettingsField label={p.pwRepeat}>
          <input type="password" autoComplete="new-password" aria-label={p.pwRepeat} value={repeat} style={error === "mismatch" ? badOutline : undefined} onChange={(e) => setRepeat(e.target.value)} />
        </SettingsField>
        {message && (
          <div style={errStyle} role="alert" data-pw-error={error}>
            {message}
          </div>
        )}
        <div style={{ marginTop: 14 }}>
          <Button variant="white" size="sm" type="submit" loading={busy}>
            {p.pwSubmit}
          </Button>
        </div>
      </form>
    </SettingsSection>
  );
}
