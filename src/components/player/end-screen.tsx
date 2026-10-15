"use client";
import { Button } from "@/components/ui/button";
import { copy } from "@/lib/copy-vi";
import { formatDayMonth, parseLocalDate } from "@/lib/format/time-format";
import type { SeasonInfoDto } from "@/lib/play/player-manifest-types";

type EndedProps = {
  kind: "ended";
  title: string;
  /** series not finished yet: "Tập tiếp theo chưa phát sóng · dd/mm" replaces "Đã xem hết" */
  upcoming?: { airDate: string | null } | null;
  /** next episode exists (card dismissed with "Huỷ"): "Tập tiếp theo" replaces "Phim tương tự" */
  onNext?: () => void;
  busy?: boolean;
  onReplay: () => void;
  onBack: () => void;
  onSimilar: () => void;
};
type EndSeasonProps = { kind: "end-season"; season: number; nextSeason: SeasonInfoDto; busy: boolean; onNextSeason: () => void; onBack: () => void };

/**
 * `.endscreen > div > h2 + p + buttons`: "Đã xem hết · {title} · đã đánh dấu đã xem" (↺ Xem lại / Về trang phim / Phim tương tự
 * — or "Tập tiếp theo" after the next-episode card was dismissed) or "Hết mùa N · Mùa N+1 có k tập, m tập chưa phát sóng."
 * (▶ Chuyển sang mùa N+1 / Về trang phim). An ongoing series ends on "Tập tiếp theo chưa phát sóng · dd/mm".
 */
export function EndScreen(props: EndedProps | EndSeasonProps) {
  const p = copy.player;
  if (props.kind === "end-season") {
    const n = props.nextSeason;
    return (
      <div className="endscreen" role="status" data-endscreen="end-season">
        <div>
          <h2>{p.endSeason.title(props.season)}</h2>
          <p>{p.endSeason.text(n.n, n.episodeCount, n.unairedCount)}</p>
          <Button variant="white" loading={props.busy} data-action="next-season" onClick={props.onNextSeason}>
            {p.endSeason.go(n.n)}
          </Button>
          <Button data-action="back" onClick={props.onBack}>
            {p.endSeason.back}
          </Button>
        </div>
      </div>
    );
  }
  const air = props.upcoming ? parseLocalDate(props.upcoming.airDate) : null;
  return (
    <div className="endscreen" role="status" data-endscreen={props.upcoming ? "upcoming" : "ended"}>
      <div>
        <h2>{props.upcoming ? p.ended.upcoming(air ? formatDayMonth(air) : null) : p.ended.title}</h2>
        <p>{p.ended.text(props.title)}</p>
        <Button variant="white" data-action="replay" onClick={props.onReplay}>
          {p.ended.replay}
        </Button>
        <Button data-action="back" onClick={props.onBack}>
          {p.ended.back}
        </Button>
        {props.onNext ? (
          <Button loading={props.busy} data-action="play-next" onClick={props.onNext}>
            {p.ended.next}
          </Button>
        ) : (
          <Button data-action="similar" onClick={props.onSimilar}>
            {p.ended.similar}
          </Button>
        )}
      </div>
    </div>
  );
}
