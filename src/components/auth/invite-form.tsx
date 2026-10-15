"use client";
import { useState, type FormEvent } from "react";
import { TextField } from "@/components/ui/text-field";
import { Button } from "@/components/ui/button";
import { PasswordStrengthMeter } from "@/components/ui/password-strength-meter";
import { useToast } from "@/components/ui/toast-provider";
import { useUsernameAvailability } from "./use-username-availability";
import { copy } from "@/lib/copy-vi";
import { renderBold } from "@/lib/format/render-bold";
import { scorePassword } from "@/lib/auth/password-strength";
import { normalizeUsername } from "@/lib/users/username-rules";

type Props = { token: string; inviterName: string; daysLeft: number };

/** "Thử “u2” hoặc “alt”": alt = first suggestion that is not `${u}2`. */
function takenMessage(u: string, suggestions: string[]): string {
  const alt = suggestions.find((s) => s !== `${u}2`) ?? suggestions[0] ?? `${u}3`;
  return copy.invite.usernameTaken(u, alt);
}

/** `/invite/[token]` signup form: live username check, strength meter, mismatch, loading, server error mapping. */
export function InviteForm({ token, inviterName, daysLeft }: Props) {
  const { toast } = useToast();
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [loading, setLoading] = useState(false);
  const [serverUserErr, setServerUserErr] = useState<string | null>(null);
  const [serverPwErr, setServerPwErr] = useState<string | null>(null);

  const avail = useUsernameAvailability(username, displayName);
  const u = normalizeUsername(username);
  const score = password ? scorePassword(password) : null;
  const mismatch = password2.length > 0 && password2 !== password;

  const userErr = serverUserErr ?? (avail.status === "taken" ? takenMessage(u, avail.suggestions) : avail.status === "invalid" ? copy.invite.usernameBad : undefined);
  const userState = userErr ? "bad" : avail.status === "ok" ? "ok" : undefined;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading || mismatch || !password || !u || !displayName.trim()) return;
    setLoading(true);
    setServerUserErr(null);
    setServerPwErr(null);
    let res: Response;
    try {
      res = await fetch("/api/auth/accept-invite", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, displayName, username: u, password }) });
    } catch {
      setLoading(false);
      toast({ type: "err", text: copy.login.offlineToast, closable: false, action: { label: copy.common.retry, onClick: () => undefined } });
      return;
    }
    if (res.ok) {
      window.location.assign("/");
      return;
    }
    const data = (await res.json().catch(() => ({}))) as { code?: string; suggestions?: string[] };
    setLoading(false);
    if (res.status === 409) setServerUserErr(takenMessage(u, data.suggestions ?? []));
    else if (res.status === 410 || res.status === 404) window.location.reload();
    else if (data.code === "BAD_USERNAME") setServerUserErr(copy.invite.usernameBad);
    else if (data.code === "WEAK_PASSWORD") setServerPwErr(copy.invite.strength(copy.invite.weak));
    else toast({ type: "err", text: copy.login.offlineToast });
  };

  return (
    <form onSubmit={submit} noValidate>
      <h2>{copy.invite.title}</h2>
      <div className="inv">{renderBold(copy.invite.banner(inviterName, daysLeft))}</div>
      <input placeholder={copy.invite.displayName} value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoFocus autoComplete="nickname" />
      <TextField
        placeholder={copy.invite.username}
        value={username}
        onChange={(e) => {
          setUsername(e.target.value);
          setServerUserErr(null);
        }}
        state={userState}
        error={userErr ?? (avail.status === "ok" ? copy.invite.usernameOk : undefined)}
        errorColor={userErr ? undefined : "#9be69b"}
        autoComplete="username"
        autoCapitalize="none"
      />
      <input placeholder={copy.invite.password} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
      <PasswordStrengthMeter score={score} />
      {serverPwErr && <div className="err">{serverPwErr}</div>}
      <TextField placeholder={copy.invite.password2} type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} state={mismatch ? "bad" : undefined} error={mismatch ? copy.invite.mismatch : undefined} autoComplete="new-password" />
      <Button type="submit" variant="red" loading={loading} style={{ color: "#fff" }}>
        {loading ? copy.invite.submitting : copy.invite.submit}
      </Button>
      <div className="hint">{copy.invite.hint}</div>
    </form>
  );
}
