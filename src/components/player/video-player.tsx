"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui/toast-provider";
import { copy } from "@/lib/copy-vi";
import { cx } from "@/lib/format/class-names";
import { mediaHref, parseMediaKey } from "@/lib/catalog/media-key";
import { readScenarioClient } from "@/lib/dev/scenario-flags-client";
import { browserCanPlay, clientPlayability } from "@/lib/play/playability-client";
import type { ResumeDto } from "@/lib/play/player-manifest-types";
import { shouldPromptResume } from "@/lib/progress/progress-rules";
import { overlayFor } from "@/lib/play/watchdog-state-machine";
import { PlayerControlsRow } from "./player-controls-row";
import { PlayerSeekBar } from "./player-seek-bar";
import { PlayerSurfaces } from "./player-surfaces";
import { PlayerTopBar } from "./player-top-bar";
import { AudioSubtitlePopover } from "./subtitles/audio-subtitle-popover";
import { SubtitleBand } from "./subtitles/subtitle-band";
import { useNativeSubtitleTrack } from "./subtitles/use-native-subtitle-track";
import { usePlayerSubtitles } from "./subtitles/use-player-subtitles";
import { useControlsAutohide } from "./use-controls-autohide";
import { useNextEpisode } from "./use-next-episode";
import { usePlaybackWatchdog } from "./use-playback-watchdog";
import { usePlayerKeyboard } from "./use-player-keyboard";
import { usePlayerManifest } from "./use-player-manifest";
import { usePlayerState } from "./use-player-state";
import { usePlayerUi } from "./use-player-ui";
import { useProgressSync } from "./use-progress-sync";
import { useTouchGestures } from "./use-touch-gestures";

type Props = { streamId: string; fromContinue: boolean; seekTo: number | null; /** backdrop known to the page before the manifest answers ("Đang lấy link…" is not a black screen) */ initialBackdropUrl: string | null };

/**
 * `/watch/[streamId]` — the `.player` surface: <video> (src only from the manifest JSON), top bar, seek bar, controls,
 * and every playback state via the watchdog + the floating surfaces. Composes the hooks; the markup of each overlay
 * lives in its own component.
 */
export function VideoPlayer({ streamId, fromContinue, seekTo, initialBackdropUrl }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const m = usePlayerManifest(streamId);
  const manifest = m.manifest;
  const { state: video, actions } = usePlayerState(videoRef, containerRef);
  const ui = usePlayerUi();
  const [resumeOffer, setResumeOffer] = useState<ResumeDto | null>(null);
  const [offline, setOffline] = useState(false);
  const [barHover, setBarHover] = useState(false);
  // seat lost after > 60 s paused while the group is full (heartbeat 429): paused + limit dialog until "Thử lại" re-acquires it
  const [seatLost, setSeatLost] = useState(false);
  const onRelinkStart = useCallback(() => void toast({ type: "warn", text: copy.player.relinkToast }), [toast]);
  const { wd, held, retryRelink, forceCodecError, resetWatchdog } = usePlaybackWatchdog({ videoRef, manifest, replaceManifest: m.replace, onRelinkStart });
  const onLimit = useCallback(() => {
    setSeatLost(true);
    actions.pause();
  }, [actions]);
  const { flush, beat } = useProgressSync({ videoRef, mediaKey: manifest?.mediaKey ?? null, streamId: manifest?.streamId ?? null, enabled: manifest !== null, heldPosition: held?.time ?? null, onLimit });
  const retrySeat = useCallback(async () => {
    if (!(await beat())) return;
    setSeatLost(false);
    void actions.play();
  }, [beat, actions]);
  const subs = usePlayerSubtitles(manifest?.mediaKey ?? null, manifest?.streamId ?? null);
  const nativeSub = useNativeSubtitleTrack(videoRef, subs.selectedTrack?.vttUrl ?? null, subs.offsetMs);
  const next = useNextEpisode({ manifest, currentTime: video.currentTime, duration: video.duration, ended: video.ended, dismissed: ui.nextDismissed, onBeforeLeave: flush });
  const blocking = resumeOffer !== null || seatLost || wd.phase === "relink-failed" || wd.phase === "codec-error" || m.status === "error";
  const controls = useControlsAutohide(video.paused || ui.anyOpen || blocking || barHover);

  const key = manifest ? parseMediaKey(manifest.mediaKey) : null;
  const detailHref = key ? mediaHref(key.type, key.tmdbId, key.season) : "/";
  const goBack = useCallback(() => {
    flush();
    router.push(detailHref);
  }, [flush, router, detailHref]);
  const pickOther = useCallback(() => {
    flush();
    router.push(key?.type === "tv" && key.season !== undefined ? `/series/${key.tmdbId}?s=${key.season}&e=${key.episode}&pick=1` : `${detailHref}?pick=1`);
  }, [flush, router, key, detailHref]);

  // attach the source once per stream handle (relink swaps src itself); resume prompt / silent resume / ?t= seek
  const attached = useRef(false);
  const startAt = useCallback(
    (t: number) => {
      const v = videoRef.current;
      if (!v) return;
      if (t > 0) {
        const seekOnce = () => {
          v.currentTime = t;
          v.removeEventListener("loadedmetadata", seekOnce);
        };
        if (v.readyState >= 1) v.currentTime = t;
        else v.addEventListener("loadedmetadata", seekOnce);
      }
      void actions.play();
    },
    [actions],
  );
  useEffect(() => {
    const v = videoRef.current;
    if (!manifest || !v || attached.current) return;
    attached.current = true;
    resetWatchdog();
    if (clientPlayability(manifest.container, manifest.codec, browserCanPlay) === "no") return forceCodecError();
    v.src = manifest.src;
    v.load();
    if (shouldPromptResume({ resume: Boolean(manifest.resume), askResume: manifest.askResume, fromContinue, hasSeekParam: seekTo !== null })) return setResumeOffer(manifest.resume!);
    startAt(seekTo !== null ? seekTo : fromContinue && manifest.resume ? manifest.resume.positionS : 0);
  }, [manifest, fromContinue, seekTo, startAt, resetWatchdog, forceCodecError]);

  // offline banner: browser event or dev scenario
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine || readScenarioClient().has("offline"));
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // unmount / episode switch: release the media pipeline so the old element stops fetching the CDN behind the next one.
  // Declared after the progress hook on purpose: cleanups run in declaration order, so the leave beacon reads the position
  // first. Only once a source was attached: StrictMode's simulated unmount runs this before the manifest arrives, and a
  // pause() + load() on the empty element makes Chromium refuse the later gesture-less play() (NotAllowedError).
  useEffect(() => {
    const v = videoRef.current;
    return () => {
      if (!v || !attached.current) return;
      v.pause();
      v.removeAttribute("src");
      v.load();
    };
  }, []);

  const togglePlay = useCallback(() => {
    ui.flashIcon(video.paused ? "play" : "pause");
    actions.togglePlay();
  }, [actions, ui, video.paused]);
  /** mobile double-tap: seek + ↺ / ↻ flash */
  const seekByWithFlash = useCallback(
    (d: number) => {
      ui.flashIcon(d < 0 ? "b10" : "f10");
      actions.seekBy(d);
    },
    [actions, ui],
  );
  // Esc closes whatever is open, then leaves fullscreen; it never exits the player itself (an accidental Esc must not lose the session)
  const escape = useCallback(() => {
    if (ui.anyOpen) return ui.closePanel();
    if (video.fullscreen) return void actions.toggleFullscreen();
  }, [ui, video.fullscreen, actions]);
  usePlayerKeyboard({ togglePlay, seekBy: actions.seekBy, volumeBy: actions.volumeBy, toggleMute: actions.toggleMute, toggleFullscreen: () => void actions.toggleFullscreen(), cycleSubtitles: subs.cycle, nextEpisode: next.goNext, escape, help: () => ui.setPanel("help"), activity: controls.poke }, containerRef, manifest !== null);
  const gestures = useTouchGestures({ seekBy: seekByWithFlash, togglePlay, toggleFullscreen: () => void actions.toggleFullscreen(), toggleControls: controls.toggle, pokeControls: controls.poke });

  // while a relink is in flight / failed the element reports 0:00 — show the last known position instead (never a 0:00 flash)
  const shown = held ?? { time: video.currentTime, duration: video.duration, buffered: video.bufferedEnd };
  const overlay = m.status === "error" || seatLost ? null : overlayFor(wd, manifest !== null);
  const hidden = !controls.visible;
  const backdropUrl = manifest?.backdropUrl ?? initialBackdropUrl;
  return (
    <div ref={containerRef} className={cx("player", hidden && "nocursor")} style={backdropUrl ? { backgroundImage: `url(${backdropUrl})` } : undefined} data-phase={wd.phase} data-controls={hidden ? "hidden" : "visible"} data-stream-id={manifest?.streamId ?? streamId} onPointerMove={(e) => e.pointerType === "mouse" && controls.poke()} onClick={gestures.onClick} onDoubleClick={gestures.onDoubleClick} onTouchEnd={gestures.onTouchEnd}>
      {/* no crossOrigin: the TorBox CDN sends no CORS headers and a plain <video src> does not need them (spike verified) */}
      <video ref={videoRef} playsInline preload="auto" style={video.hasFrame ? undefined : { opacity: 0 }}>
        {/* native track for the iPhone system full screen (hidden otherwise — the band below renders the cues) */}
        {subs.selectedTrack && <track ref={nativeSub.trackRef} key={subs.selectedTrack.vttUrl} kind="subtitles" srcLang={subs.selectedTrack.lang} label={subs.selectedTrack.label} src={subs.selectedTrack.vttUrl} data-native-sub={subs.selectedTrack.id} />}
      </video>
      <PlayerTopBar onBack={goBack} hidden={hidden} />
      <SubtitleBand videoRef={videoRef} track={subs.selectedTrack} offsetMs={subs.offsetMs} size={subs.size} controlsHidden={hidden} />
      {manifest && (
        <div className="pbar" style={hidden ? { display: "none" } : undefined} onPointerEnter={(e) => e.pointerType === "mouse" && setBarHover(true)} onPointerLeave={(e) => e.pointerType === "mouse" && setBarHover(false)}>
          <PlayerSeekBar current={shown.time} duration={shown.duration} buffered={shown.buffered} onSeek={actions.seek} showRemaining={ui.showRemaining} onToggleRemaining={ui.toggleRemaining} backdropUrl={manifest.backdropUrl} />
          <PlayerControlsRow manifest={manifest} video={video} onTogglePlay={togglePlay} onSeekBy={actions.seekBy} onVolume={actions.setVolume} onToggleMute={actions.toggleMute} onRate={actions.setRate} onSpeedOpen={(o) => ui.setPanel(o ? "speed" : "none")} onNext={next.goNext} onEpisodes={() => ui.setPanel("drawer")} onCc={() => ui.setPanel("subs")} onPip={() => void actions.togglePip()} onCast={() => ui.setPanel("handoff")} onFullscreen={() => void actions.toggleFullscreen()} />
        </div>
      )}
      {ui.panel === "subs" && manifest && <AudioSubtitlePopover manifest={manifest} subs={subs} videoRef={videoRef} onClose={ui.closePanel} onPickOther={pickOther} />}
      <PlayerSurfaces streamId={streamId} manifest={manifest} manifestError={m.error} reloadManifest={m.reload} video={video} shownTime={shown.time} actions={actions} wd={wd} overlay={overlay} offline={offline} ui={ui} next={next} resumeOffer={resumeOffer} onResume={(restart) => { setResumeOffer(null); startAt(restart ? 0 : (manifest?.resume?.positionS ?? 0)); }} retryRelink={retryRelink} seatLost={seatLost} retrySeat={() => void retrySeat()} onBack={goBack} onPickOther={pickOther} detailHref={detailHref} />
    </div>
  );
}
