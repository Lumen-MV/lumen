"use client";
import { Button } from "@/components/ui/button";
import { copy } from "@/lib/copy-vi";
import type { NextEpisodeDto } from "@/lib/play/player-manifest-types";

type Props = { next: NextEpisodeDto; countdown: number | null; busy: boolean; onPlayNow: () => void; onCancel: () => void };

/** `.nextcard > img + (.t "Tập tiếp theo · S4 T2" + .n title + buttons) + .ring(N)` — the ring only with `autoplay_next`. */
export function NextEpisodeCard({ next, countdown, busy, onPlayNow, onCancel }: Props) {
  const n = copy.player.next;
  return (
    <div className="nextcard" role="status" aria-live="polite" data-next-episode={`${next.season}:${next.episode}`} data-countdown={countdown ?? undefined}>
      {next.stillUrl ? <img src={next.stillUrl} alt="" /> : <div style={{ width: 110, height: 62, borderRadius: 4, background: "#333", flex: "none" }} />}
      <div style={{ flex: 1 }}>
        <div className="t">{n.label(next.season, next.episode)}</div>
        <div className="n">{next.title}</div>
        <div style={{ display: "flex", gap: 6 }}>
          <Button variant="white" size="sm" loading={busy} data-action="play-next" onClick={onPlayNow}>
            {n.playNow}
          </Button>
          <Button size="sm" data-action="cancel-next" onClick={onCancel}>
            {n.cancel}
          </Button>
        </div>
      </div>
      {countdown !== null && <div className="ring">{countdown}</div>}
    </div>
  );
}
