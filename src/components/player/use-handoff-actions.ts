"use client";
import { useCallback } from "react";
import { useToast } from "@/components/ui/toast-provider";
import { copy } from "@/lib/copy-vi";
import type { HandoffApp, HandoffTarget } from "@/lib/play/external-player-links";

/**
 * Hand-off sheet actions: GET /api/play/external?target= → open the deep link (toast "Đang mở {app}…", Stremio also
 * gets the "Đã gửi tới Stremio" dialog), copy the raw video link (toast "✓ Đã sao chép link · hết hạn sau 50 phút") or
 * copy the signed `.srt` subtitle link on its own (toast "✓ Đã sao chép link phụ đề …"; "Bản này chưa có phụ đề…" when
 * the title has none) so the owner can paste it into Infuse / VLC by hand.
 */
export const APP_LABEL: Record<HandoffApp, string> = { stremio: copy.player.handoff.apps.stremio, infuse: copy.player.handoff.apps.infuse, vlc: copy.player.handoff.apps.vlc };

type ExternalLink = { url: string; subtitle: { label: string; url: string } | null };

async function externalUrl(streamId: string, target: Exclude<HandoffTarget, "qr">): Promise<ExternalLink | null> {
  try {
    const r = await fetch(`/api/play/external?streamId=${encodeURIComponent(streamId)}&target=${target}`, { cache: "no-store" });
    const json = (await r.json().catch(() => null)) as Partial<ExternalLink> | null;
    if (!r.ok || !json?.url) return null;
    const sub = json.subtitle;
    return { url: json.url, subtitle: sub && typeof sub.url === "string" && typeof sub.label === "string" ? { label: sub.label, url: sub.url } : null };
  } catch (err) {
    console.warn("[handoff] external", err);
    return null;
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // http / permission denied → the legacy path still works inside a click handler
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } finally {
      ta.remove();
    }
    return ok;
  }
}

export function useHandoffActions(streamId: string | null, onSent: (app: string) => void, onDone: () => void) {
  const { toast } = useToast();
  const h = copy.player.handoff;

  const openApp = useCallback(
    async (app: HandoffApp) => {
      if (!streamId) return;
      const label = APP_LABEL[app];
      const link = await externalUrl(streamId, app);
      onDone();
      if (!link) return void toast({ type: "err", text: copy.toastSamples.torboxDown });
      toast({ type: "info", text: h.openingToast(label) });
      window.location.assign(link.url);
      if (app === "stremio") onSent(label);
    },
    [streamId, toast, onSent, onDone, h],
  );

  const copyLink = useCallback(async () => {
    if (!streamId) return;
    const link = await externalUrl(streamId, "copy");
    onDone();
    const ok = link ? await copyText(link.url) : false;
    toast(ok ? { type: "success", text: h.copiedToast } : { type: "err", text: h.copyFailToast });
  }, [streamId, toast, onDone, h]);

  const copySubLink = useCallback(async () => {
    if (!streamId) return;
    const link = await externalUrl(streamId, "copy");
    onDone();
    if (link && !link.subtitle) return void toast({ type: "info", text: h.noSubToast });
    const ok = link?.subtitle ? await copyText(link.subtitle.url) : false;
    toast(ok ? { type: "success", text: h.copiedSubToast } : { type: "err", text: h.copyFailToast });
  }, [streamId, toast, onDone, h]);

  return { openApp, copyLink, copySubLink };
}
