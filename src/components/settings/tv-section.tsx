"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { QrCode } from "@/components/ui/qr-code";
import { useToast } from "@/components/ui/toast-provider";
import { copy } from "@/lib/copy-vi";
import { renderBold } from "@/lib/format/render-bold";
import { copyText, downloadQrPng } from "./download-qr";
import { SettingsField, SettingsSection } from "./settings-shell";

export type DeviceTokenDto = { url: string | null; masked: string | null; revoked: boolean };
/** settings.html `.qr`: 150px, 6px white border, no margin (screens.css also carries the player's 200px/12px-margin `.qr`) */
const qrStyle = { width: 150, height: 150, margin: 0, border: "6px solid #fff" } as const;

async function call(method: "POST" | "DELETE"): Promise<DeviceTokenDto> {
  const res = await fetch("/api/me/device-token", { method });
  if (!res.ok) throw new Error(`${method} /api/me/device-token ${res.status}`);
  return (await res.json()) as DeviceTokenDto;
}

/**
 * Thiết bị & TV: `.tvbox` (QR + 3 steps + masked manifest URL + Sao chép link / Tải mã QR / Thu hồi link → confirm dialog
 * → "— đã thu hồi, bấm Tạo link mới —" + Tạo link mới), then the iPhone / Máy tính rows.
 */
export function TvSection({ initial }: { initial: DeviceTokenDto }) {
  const t = copy.settings.tv;
  const { toast } = useToast();
  const [state, setState] = useState(initial);
  const [confirm, setConfirm] = useState(false);
  const [guide, setGuide] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async (method: "POST" | "DELETE", done: string) => {
    setBusy(true);
    try {
      setState(await call(method));
      toast({ type: method === "POST" ? "success" : "info", text: done });
    } catch (err) {
      console.error("[device-token]", err);
      toast({ type: "err", text: copy.settings.errToast });
    } finally {
      setBusy(false);
    }
  };
  const copyLink = async () => {
    if (!state.url) return;
    toast((await copyText(state.url)) ? { type: "success", text: t.copiedToast } : { type: "err", text: copy.player.handoff.copyFailToast });
  };
  const downloadQr = () => state.url && downloadQrPng(state.url, t.qrFile).catch((err) => console.error("[qr]", err));

  return (
    <SettingsSection title={copy.settings.nav[3]} desc={t.desc}>
      <div className="tvbox" data-token={state.revoked ? "revoked" : "active"}>
        {state.url ? <QrCode value={state.url} size={150} style={qrStyle} /> : <div className="qr" style={qrStyle} />}
        <div style={{ flex: 1 }}>
          <b>{t.title}</b>
          <ol className="steps3">
            {t.steps.map((s) => (
              <li key={s}>{renderBold(s)}</li>
            ))}
          </ol>
          <code data-manifest>{state.revoked || !state.masked ? t.revoked : state.masked}</code>
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="white" size="sm" disabled={!state.url} onClick={() => void copyLink()}>
              {t.copy}
            </Button>
            <Button size="sm" disabled={!state.url} onClick={() => void downloadQr()}>
              {t.downloadQr}
            </Button>
            {state.revoked ? (
              <Button size="sm" loading={busy} onClick={() => void run("POST", t.createdToast)}>
                {t.create}
              </Button>
            ) : (
              <Button size="sm" loading={busy} onClick={() => setConfirm(true)}>
                {t.revoke}
              </Button>
            )}
          </div>
        </div>
      </div>
      <SettingsField label={t.iphone} hint={t.iphoneHint} style={{ marginTop: 14 }}>
        <Button size="sm" onClick={() => setGuide(true)}>
          {t.guide}
        </Button>
      </SettingsField>
      <SettingsField label={t.pc} hint={t.pcHint} />
      <Dialog open={confirm} onOpenChange={setConfirm} title={t.revokeTitle} body={t.revokeText} actions={[{ label: copy.common.cancel }, { label: t.revokeOk, variant: "red", onClick: () => run("DELETE", t.revokedToast) }]} />
      <Dialog open={guide} onOpenChange={setGuide} variant="info" title={t.iphone} body={t.iphoneHint} actions={[{ label: copy.common.close, variant: "white" }]} />
    </SettingsSection>
  );
}
