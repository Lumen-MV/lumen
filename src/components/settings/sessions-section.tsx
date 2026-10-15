"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast-provider";
import { copy } from "@/lib/copy-vi";
import { SettingsSection } from "./settings-shell";

/** Row model built on the server: browser sessions + the active Stremio token as one more device. */
export type SessionRow = { id: string; label: string; detail: string; current: boolean; kind: "session" | "stremio" };

const currentStyle = { color: "#46d369", fontSize: 13 } as const;

/** Phiên đăng nhập: `.dev` rows (label + small), "Hiện tại" for this device, per-device logout, "Đăng xuất tất cả thiết bị khác". */
export function SessionsSection({ initial }: { initial: SessionRow[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const s = copy.settings.sessions;
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);

  const fail = (err: unknown) => {
    console.error("[sessions]", err);
    toast({ type: "err", text: copy.settings.errToast });
  };
  const logoutOne = async (row: SessionRow) => {
    setBusy(row.id);
    try {
      const res = row.kind === "stremio" ? await fetch("/api/me/device-token", { method: "DELETE" }) : await fetch(`/api/me/sessions?id=${encodeURIComponent(row.id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`logout ${row.id} → ${res.status}`);
      setRows((r) => r.filter((x) => x.id !== row.id));
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  };
  const logoutOthers = async () => {
    setBusy("others");
    try {
      const res = await fetch("/api/me/sessions?others=1", { method: "DELETE" });
      if (!res.ok) throw new Error(`logout others → ${res.status}`);
      setRows((r) => r.filter((x) => x.current || x.kind === "stremio"));
      router.refresh();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  };

  return (
    <SettingsSection title={copy.settings.nav[4]} desc={s.desc}>
      {rows.map((row) => (
        <div className="dev" key={row.id} data-session={row.kind} data-current={row.current || undefined}>
          <div>
            {row.label}
            <small>{row.detail}</small>
          </div>
          {row.current ? (
            <span style={currentStyle}>{s.current}</span>
          ) : (
            <Button size="sm" loading={busy === row.id} onClick={() => void logoutOne(row)}>
              {s.logoutDevice}
            </Button>
          )}
        </div>
      ))}
      <div style={{ marginTop: 16 }}>
        <Button size="sm" loading={busy === "others"} disabled={!rows.some((r) => !r.current && r.kind === "session")} onClick={() => void logoutOthers()}>
          {s.logoutOthers}
        </Button>
      </div>
    </SettingsSection>
  );
}
