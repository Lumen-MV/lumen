"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { TextField } from "@/components/ui/text-field";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast-provider";
import { copy } from "@/lib/copy-vi";
import { formatCountdown } from "@/lib/format/time-format";
import { safeNextPath } from "@/lib/auth/safe-next-path";

type LoginError = { kind: "wrong" } | { kind: "locked" } | { kind: "rate"; until: number };

/** `/login` form: idle → loading (`.load`) → wrong (`.bad` + shake) / locked / rate-limited countdown / offline toast. */
export function LoginForm({ next }: { next?: string }) {
  const { toast } = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<LoginError | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const remainingS = error?.kind === "rate" ? Math.ceil((error.until - now) / 1000) : 0;

  useEffect(() => {
    if (error?.kind !== "rate") return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [error]);

  useEffect(() => {
    if (error?.kind === "rate" && remainingS <= 0) setError(null);
  }, [remainingS, error]);

  const offline = () =>
    toast({ type: "err", text: copy.login.offlineToast, closable: false, action: { label: copy.common.retry, onClick: () => formRef.current?.requestSubmit() } });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading || remainingS > 0) return;
    setLoading(true);
    setError(null);
    let res: Response;
    try {
      res = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password, remember }) });
    } catch {
      setLoading(false);
      offline();
      return;
    }
    if (res.ok) {
      const data = (await res.json().catch(() => ({}))) as { user?: { mustChangePassword?: boolean } };
      // temp password issued by the admin → straight to "Đổi mật khẩu"; else same-origin check against the live origin
      window.location.assign(data.user?.mustChangePassword ? "/settings?tab=profile" : safeNextPath(next, window.location.origin));
      return;
    }
    const data = (await res.json().catch(() => ({}))) as { code?: string; retryAfterS?: number };
    setLoading(false);
    if (res.status === 401) setError({ kind: "wrong" });
    else if (res.status === 403) setError({ kind: "locked" });
    else if (res.status === 429) setError({ kind: "rate", until: Date.now() + (data.retryAfterS ?? 300) * 1000 });
    else offline();
  };

  const message = error?.kind === "wrong" ? copy.login.errWrong : error?.kind === "locked" ? copy.login.errLocked : error?.kind === "rate" ? copy.login.errRate(formatCountdown(remainingS)) : undefined;

  return (
    <form ref={formRef} onSubmit={submit} noValidate>
      <h2>{copy.login.title}</h2>
      <TextField name="username" placeholder={copy.login.username} value={username} onChange={(e) => setUsername(e.target.value)} state={error?.kind === "locked" ? "bad" : undefined} autoFocus autoComplete="username" autoCapitalize="none" />
      <TextField name="password" placeholder={copy.login.password} value={password} onChange={(e) => setPassword(e.target.value)} eye state={error?.kind === "wrong" ? "bad" : undefined} shake={error?.kind === "wrong"} error={message} autoComplete="current-password" />
      <label>
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> {copy.login.remember}
      </label>
      <Button type="submit" variant="red" loading={loading} disabled={remainingS > 0} style={{ color: "#fff" }}>
        {loading ? copy.login.submitting : copy.login.submit}
      </Button>
      <div className="hint">{copy.login.hint}</div>
    </form>
  );
}
