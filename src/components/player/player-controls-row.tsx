"use client";
import { copy } from "@/lib/copy-vi";
import { Icon } from "@/lib/icons";
import type { PlayerManifest } from "@/lib/play/player-manifest-types";
import { SpeedMenu } from "./speed-menu";
import type { VideoState } from "./use-player-state";
import { VolumeSlider } from "./volume-slider";

type Props = {
  manifest: PlayerManifest;
  video: VideoState;
  onTogglePlay: () => void;
  onSeekBy: (d: number) => void;
  onVolume: (v: number) => void;
  onToggleMute: () => void;
  onRate: (r: number) => void;
  onSpeedOpen: (o: boolean) => void;
  onNext: () => void;
  onEpisodes: () => void;
  onCc: () => void;
  onPip: () => void;
  onCast: () => void;
  onFullscreen: () => void;
};

const ib = (name: Parameters<typeof Icon>[0]["name"], label: string, action: string, onClick: () => void, extra?: Record<string, unknown>) => (
  <button type="button" className="ib" aria-label={label} data-action={action} onClick={onClick} {...extra}>
    <Icon name={name} />
  </button>
);

/**
 * `.ctl` in mockup order: pause/play · ↺10 · ↻10 · volume · `.title(<b>Tên</b><span>1080p · MP4 | S4 T1 · Tên tập</span>)` ·
 * [next · episodes (series)] · cc · speed · pip · cast · fullscreen. Icons are the ICON set from screen-player.js.
 */
export function PlayerControlsRow({ manifest, video, onTogglePlay, onSeekBy, onVolume, onToggleMute, onRate, onSpeedOpen, onNext, onEpisodes, onCc, onPip, onCast, onFullscreen }: Props) {
  const a = copy.player.aria;
  const series = manifest.series;
  return (
    <div className="ctl">
      {ib(video.paused ? "play" : "pause", video.paused ? a.play : a.pause, "toggle-play", onTogglePlay, { "data-paused": video.paused })}
      {ib("b10", a.back10, "back10", () => onSeekBy(-10))}
      {ib("f10", a.fwd10, "fwd10", () => onSeekBy(10))}
      <VolumeSlider volume={video.volume} muted={video.muted} onVolume={onVolume} onToggleMute={onToggleMute} />
      <div className="title">
        <b>{manifest.title}</b>
        <span>{series ? copy.player.epMeta(series.season, series.episode, series.epTitle) : copy.player.titleMeta(manifest.qualityLabel, manifest.container)}</span>
      </div>
      {series && ib("next", a.next, "next", onNext, { disabled: !manifest.next })}
      {series && ib("eps", a.episodes, "episodes", onEpisodes)}
      {ib("cc", a.cc, "cc", onCc, { "aria-haspopup": "dialog" })}
      <SpeedMenu rate={video.rate} onRate={onRate} onOpenChange={onSpeedOpen} />
      {video.pipAvailable && ib("pip", a.pip, "pip", onPip, { "aria-pressed": video.pip })}
      {ib("cast", a.cast, "cast", onCast)}
      {video.fullscreenAvailable && ib("fs", a.fullscreen, "fullscreen", onFullscreen, { "aria-pressed": video.fullscreen })}
    </div>
  );
}
