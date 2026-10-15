"use client";
import { copy } from "@/lib/copy-vi";
import { cx } from "@/lib/format/class-names";
import type { SubTrack } from "@/lib/subtitles/subtitle-types";

type Props = { tracks: SubTrack[]; selectedId: number | null; onSelect: (id: number | null) => void };

/**
 * "Tắt" + one `.it` per track (✓ via `.on`, 🔒 greyed when the OS quota is gone and the file was never fetched). A
 * `<small>` line names the release a community file was timed for when a language lists several files, and flags the
 * one matching the playing release ("khớp bản đang phát") so a drifting subtitle can be swapped for the right one.
 */
export function SubtitleTrackList({ tracks, selectedId, onSelect }: Props) {
  const s = copy.subs;
  const several = (lang: string) => tracks.filter((t) => t.lang === lang && t.release !== undefined).length > 1;
  return (
    <>
      <button type="button" className={cx("it", selectedId === null && "on")} aria-pressed={selectedId === null} data-track="off" onClick={() => onSelect(null)}>
        {s.off}
      </button>
      {tracks.map((t) => {
        const tag = t.release && several(t.lang) ? t.release : null;
        return (
          <button key={t.id} type="button" className={cx("it", t.id === selectedId && "on", t.locked && "locked")} aria-pressed={t.id === selectedId} aria-disabled={t.locked || undefined} disabled={t.locked} data-track={t.id} data-lang={t.lang} data-source={t.source} data-matched={t.matched || undefined} onClick={() => !t.locked && onSelect(t.id)}>
            {t.label}
            {t.locked && ` ${s.locked}`}
            {(tag || t.matched) && (
              <small data-release>
                {tag}
                {t.matched && <span className="match">{tag ? " · " : ""}{s.matched}</span>}
              </small>
            )}
          </button>
        );
      })}
    </>
  );
}
