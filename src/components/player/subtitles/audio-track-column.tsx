"use client";
import { copy } from "@/lib/copy-vi";

type Props = { audio: string; qualityLabel: string; container: string; /** `video.audioTracks.length > 1` (Safari) — browsers cannot switch MKV audio, so the extra track is listed read-only */ multi: boolean };

/** Left column of the popover: the playing audio track ✓, the single-track note (or the read-only dub item + reload note), the direct-play line. */
export function AudioTrackColumn({ audio, qualityLabel, container, multi }: Props) {
  const s = copy.subs;
  return (
    <div className="col" data-col="audio">
      <h4>{s.audio}</h4>
      <button type="button" className="it on" aria-pressed="true" data-audio="en">
        {s.audioItem(s.audioEn, audio)}
      </button>
      {multi ? (
        <>
          <div className="it" aria-disabled="true" data-audio="vi">{s.audioViDub}</div>
          <div className="small">{s.audioSwitchNote}</div>
        </>
      ) : (
        <div className="small">{s.singleAudio}</div>
      )}
      <div className="small">{s.directLine(qualityLabel, container)}</div>
    </div>
  );
}
