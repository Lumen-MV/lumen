"use client";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { copy } from "@/lib/copy-vi";
import type { PlayerManifest } from "@/lib/play/player-manifest-types";
import { canOfferAiTranslate } from "@/lib/subtitles/subtitle-auto-select";
import { AudioTrackColumn } from "./audio-track-column";
import { QuotaNote } from "./quota-note";
import { SubtitleOffsetControl } from "./subtitle-offset-control";
import { SubtitleSizeControl } from "./subtitle-size-control";
import { SubtitleSourceLine } from "./subtitle-source-line";
import { SubtitleTrackList } from "./subtitle-track-list";
import { TranslateAiRow } from "./translate-ai-row";
import type { PlayerSubtitles } from "./use-player-subtitles";

type Props = { manifest: PlayerManifest; subs: PlayerSubtitles; videoRef: React.RefObject<HTMLVideoElement | null>; onClose: () => void; onPickOther: () => void };
const FOCUSABLE = "button:not([disabled])";
/** controls keep working on the dismissing click; only the bare player surface (which would toggle play) is swallowed */
const PASS_THROUGH = "button, a, [role=menuitem], [role=slider], .pbar, .ptop";
const SWALLOW_WINDOW_MS = 500;

/**
 * `.pop` "Âm thanh | Phụ đề" (mockup `subsPop()`): two columns, ✓ items, the AI row in its three states, the quota note,
 * the none-at-all note + "Chọn bản khác có phụ đề", offset / size controls, source line. Rendered inside `.player`
 * (the mockup's `:has(.pop)` rule lifts the band). Outside click / Esc close it (the click that dismisses never
 * reaches the player surface, so it cannot toggle play); ↑↓ Home End move between rows, Tab walks every control;
 * the player hotkeys ignore keys fired inside (`role=dialog`).
 */
export function AudioSubtitlePopover({ manifest, subs, videoRef, onClose, onPickOther }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [multiAudio, setMultiAudio] = useState(false);
  const s = copy.subs;
  useEffect(() => {
    const v = videoRef.current as (HTMLVideoElement & { audioTracks?: { length: number } }) | null;
    setMultiAudio((v?.audioTracks?.length ?? 0) > 1);
    let swallow: ((ev: MouseEvent) => void) | null = null;
    let swallowTimer: ReturnType<typeof setTimeout> | null = null;
    const dropSwallow = () => {
      if (swallow) document.removeEventListener("click", swallow, true);
      if (swallowTimer) clearTimeout(swallowTimer);
      swallow = null;
      swallowTimer = null;
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!ref.current || ref.current.contains(t) || t.closest('[data-action="cc"]')) return;
      // the click that follows this mousedown must not reach the player surface (it would toggle play / pause)
      dropSwallow();
      swallow = (ev: MouseEvent) => {
        dropSwallow();
        if (!(ev.target as HTMLElement).closest(PASS_THROUGH)) ev.stopPropagation();
      };
      document.addEventListener("click", swallow, true);
      swallowTimer = setTimeout(dropSwallow, SWALLOW_WINDOW_MS);
      onClose();
    };
    document.addEventListener("mousedown", onDown);
    (ref.current?.querySelector<HTMLButtonElement>('[data-col="subs"] .it.on') ?? ref.current?.querySelector<HTMLButtonElement>(FOCUSABLE))?.focus();
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose, videoRef]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      return onClose();
    }
    const items = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>(`.it${FOCUSABLE.slice("button".length)}, .it button, .ctrl button`) ?? []);
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    const to = e.key === "ArrowDown" ? (i + 1) % items.length : e.key === "ArrowUp" ? (i - 1 + items.length) % items.length : e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : -1;
    if (to < 0 || !items.length) return;
    e.preventDefault();
    items[to].focus();
  };

  const none = subs.status === "ready" && subs.tracks.length === 0;
  const showAi = subs.status === "ready" && canOfferAiTranslate(subs.tracks);
  return (
    <div ref={ref} className="pop" role="dialog" aria-label={s.popoverAria} data-popover="subs" onKeyDown={onKeyDown} onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <AudioTrackColumn audio={manifest.audio} qualityLabel={manifest.qualityLabel} container={manifest.container} multi={multiAudio} />
      <div className="col" data-col="subs">
        <h4>{s.subtitles}</h4>
        {subs.status === "loading" && <div className="small">{s.loading}</div>}
        <SubtitleTrackList tracks={subs.tracks} selectedId={subs.selectedId} onSelect={subs.select} />
        {showAi && <TranslateAiRow state={subs.job.state} percent={subs.job.percent} onTranslate={() => void subs.translate()} />}
        {none && (
          <>
            <div className="small none" data-none-note>{s.none}</div>
            <button type="button" className="it" data-action="pick-other" onClick={onPickOther}>{s.pickOther}</button>
          </>
        )}
        {subs.quota.remaining <= 0 && subs.tracks.some((t) => t.locked) && <QuotaNote quota={subs.quota} />}
        <SubtitleOffsetControl offsetMs={subs.offsetMs} onChange={subs.changeOffset} />
        <SubtitleSizeControl size={subs.size} onChange={subs.changeSize} />
        <SubtitleSourceLine track={subs.selectedTrack} />
      </div>
    </div>
  );
}
