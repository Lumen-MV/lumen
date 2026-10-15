"use client";
import { copy } from "@/lib/copy-vi";
import { Icon } from "@/lib/icons";

/** Volume icon (click = mute) with the hover vertical slider (`.volwrap > button.ib + .volslider > input[type=range]`). */
export function VolumeSlider({ volume, muted, onVolume, onToggleMute }: { volume: number; muted: boolean; onVolume: (v: number) => void; onToggleMute: () => void }) {
  const shown = muted ? 0 : volume;
  return (
    <span className="volwrap" data-muted={muted || undefined}>
      <button type="button" className="ib" aria-label={muted ? copy.player.aria.volume : copy.player.aria.mute} aria-pressed={muted} data-action="mute" onClick={onToggleMute} style={muted ? { opacity: 0.5 } : undefined}>
        <Icon name="vol" />
      </button>
      <span className="volslider">
        <input type="range" min={0} max={100} value={Math.round(shown * 100)} aria-label={copy.player.aria.volume} data-action="volume" onChange={(e) => onVolume(Number(e.target.value) / 100)} />
      </span>
    </span>
  );
}
