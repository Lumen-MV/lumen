"use client";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useToast } from "@/components/ui/toast-provider";
import { copy } from "@/lib/copy-vi";
import { Icon } from "@/lib/icons";
import { parseMediaKey } from "@/lib/catalog/media-key";
import { resumeQrUrl } from "@/lib/play/external-player-links";
import { fetchPostJson } from "@/lib/play/next-episode";
import type { ManifestError, PlayerManifest, ResumeDto } from "@/lib/play/player-manifest-types";
import { percentOf } from "@/lib/progress/progress-rules";
import type { WatchdogState } from "@/lib/play/watchdog-state-machine";
import { EndScreen } from "./end-screen";
import { EpisodeDrawer } from "./episode-drawer";
import { HandoffSheet } from "./handoff-sheet";
import { NextEpisodeCard } from "./next-episode-card";
import { PlayerBanner } from "./player-banner";
import { PlayerCenterOverlay, type CenterOverlayKind } from "./player-center-overlay";
import { CodecErrorDialog, HandoffSentDialog, LinkExpiredDialog, QrDialog, StreamExpiredDialog, ViewerLimitDialog } from "./player-dialogs";
import { PlayerKeyboardHelp } from "./player-keyboard-help";
import { ResumeDialog } from "./resume-dialog";
import { useHandoffActions } from "./use-handoff-actions";
import type { useNextEpisode } from "./use-next-episode";
import type { PlayerActions, VideoState } from "./use-player-state";
import type { PlayerUi } from "./use-player-ui";

type Props = {
  streamId: string;
  manifest: PlayerManifest | null;
  manifestError: ManifestError | null;
  reloadManifest: () => void;
  video: VideoState;
  /** position to quote (QR, link-expired dialog): the held one during a relink, else the live clock */
  shownTime: number;
  actions: PlayerActions;
  wd: WatchdogState;
  overlay: CenterOverlayKind | null;
  offline: boolean;
  ui: PlayerUi;
  next: ReturnType<typeof useNextEpisode>;
  resumeOffer: ResumeDto | null;
  onResume: (restart: boolean) => void;
  retryRelink: () => void;
  seatLost: boolean;
  retrySeat: () => void;
  onBack: () => void;
  onPickOther: () => void;
  detailHref: string;
};

/** Every floating surface of the player (overlays, banners, cards, sheet, drawer, dialogs, help, centre flash) in one place. */
export function PlayerSurfaces({ streamId, manifest, manifestError, reloadManifest, video, shownTime, actions, wd, overlay, offline, ui, next, resumeOffer, onResume, retryRelink, seatLost, retrySeat, onBack, onPickOther, detailHref }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const handoff = useHandoffActions(manifest?.streamId ?? streamId, ui.openSent, ui.closePanel);
  const openApp = useCallback(() => ui.setPanel("handoff"), [ui]);
  const showQr = useCallback(() => {
    const key = manifest ? parseMediaKey(manifest.mediaKey) : null;
    if (key) setQrUrl(resumeQrUrl(window.location.origin, key, shownTime));
    ui.closePanel();
  }, [manifest, ui, shownTime]);
  const pickMp4 = useCallback(async () => {
    if (!manifest?.mp4Alt) return;
    const r = await fetchPostJson("/api/play/resolve", { mediaKey: manifest.mediaKey, hash: manifest.mp4Alt.hash });
    const id = r.json?.streamId;
    if (r.status === 200 && typeof id === "string") router.replace(`/watch/${id}`);
    else toast({ type: "err", text: r.status === 503 ? copy.toastSamples.torboxDown : copy.home.errRow });
  }, [manifest, router, toast]);
  const series = manifest?.series;
  const ended = video.ended && !next.due;
  const livePercent = percentOf(video.currentTime, video.duration);
  // end screens: no next episode → end-season / ended; next episode dismissed with "Huỷ" → ended screen with "Tập tiếp theo"
  const endScreen = ended && manifest ? (manifest.next ? (ui.nextDismissed ? "ended" : null) : manifest.endSeason?.nextSeason ? "end-season" : "ended") : null;
  const endedTitle = series ? copy.player.epMeta(series.season, series.episode, series.epTitle) : (manifest?.title ?? "");
  return (
    <>
      {ui.flash && (
        <div key={ui.flash.n} className="pflash" aria-hidden="true">
          <Icon name={ui.flash.kind} />
        </div>
      )}
      {overlay && wd.phase !== "ended" && !ended && <PlayerCenterOverlay kind={overlay} seconds={wd.stallSeconds} onOpenApp={openApp} onOther={onPickOther} />}
      {offline && <PlayerBanner kind="offline" remainingS={Math.max(0, Math.round(video.bufferedEnd - video.currentTime))} onRetry={() => window.location.reload()} />}
      {wd.noAudio && !ui.noAudioDismissed && <PlayerBanner kind="no-audio" onOpenApp={openApp} onOther={onPickOther} />}
      {next.due && next.next && <NextEpisodeCard next={next.next} countdown={next.countdown} busy={next.busy} onPlayNow={next.goNext} onCancel={() => ui.setNextDismissed(true)} />}
      {endScreen === "end-season" && manifest?.endSeason?.nextSeason && series && (
        <EndScreen kind="end-season" season={manifest.endSeason.season} nextSeason={manifest.endSeason.nextSeason} busy={next.busy} onBack={onBack} onNextSeason={() => void next.go({ mediaKey: `tv:${series.tmdbId}:${manifest.endSeason!.nextSeason!.n}:1`, samePack: false, tmdbId: series.tmdbId, season: manifest.endSeason!.nextSeason!.n, episode: 1 })} />
      )}
      {endScreen === "ended" && manifest && (
        <EndScreen kind="ended" title={endedTitle} upcoming={manifest.next ? null : manifest.endSeason?.upcoming} onNext={manifest.next ? next.goNext : undefined} busy={next.busy} onReplay={() => { actions.seek(0); void actions.play(); }} onBack={onBack} onSimilar={() => router.push(`${detailHref}#similar`)} />
      )}
      {ui.panel === "handoff" && <HandoffSheet onApp={handoff.openApp} onCopy={handoff.copyLink} onCopySub={handoff.copySubLink} onQr={showQr} onClose={ui.closePanel} />}
      {ui.panel === "drawer" && series && <EpisodeDrawer seriesId={series.tmdbId} seasons={series.seasons} current={{ season: series.season, episode: series.episode }} livePercent={livePercent} onPick={(s, e) => void next.go({ mediaKey: `tv:${series.tmdbId}:${s}:${e}`, samePack: s === series.season, tmdbId: series.tmdbId, season: s, episode: e })} onClose={ui.closePanel} />}
      <HandoffSentDialog app={ui.panel === "sent" ? ui.sentApp : null} onClose={ui.closePanel} />
      <QrDialog url={qrUrl} positionS={shownTime} onClose={() => setQrUrl(null)} />
      <PlayerKeyboardHelp open={ui.panel === "help"} onOpenChange={(o) => ui.setPanel(o ? "help" : "none")} />
      <ResumeDialog resume={resumeOffer} onContinue={() => onResume(false)} onRestart={() => onResume(true)} />
      <CodecErrorDialog open={wd.phase === "codec-error" && ui.panel !== "handoff"} group={manifest?.releaseGroup || "?"} format={manifest ? `${manifest.container} ${manifest.codec}`.trim() : ""} alt={manifest?.mp4Alt ?? null} onOpenApp={openApp} onPickMp4={() => void pickMp4()} onClose={onBack} />
      <LinkExpiredDialog open={wd.phase === "relink-failed"} positionS={shownTime} onBack={onBack} onRetry={retryRelink} />
      <ViewerLimitDialog open={(manifestError?.code === "LIMIT_5" || seatLost) && ui.panel !== "handoff"} onOpenApp={openApp} onRetry={seatLost ? retrySeat : reloadManifest} onClose={onBack} />
      <StreamExpiredDialog open={manifestError?.code === "STREAM_EXPIRED" || manifestError?.code === "SERVER_ERROR"} onBack={onBack} />
    </>
  );
}
