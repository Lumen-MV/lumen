"use client";
import { Tag } from "@/components/ui/tag";
import { copy } from "@/lib/copy-vi";
import { cx } from "@/lib/format/class-names";
import type { Release } from "@/lib/sources/sources-types";
import { SourceRowAction, type RowActionKind } from "./source-row-action";
import { SourceRowBadges } from "./source-row-badges";
import { rowFileText, rowMetaText } from "./source-row-meta";

type Props = {
  release: Release;
  episode?: number;
  recommended: boolean;
  /** the viewer's remembered "Lần trước" row (grey outline tag after the state tags) */
  lastPick?: boolean;
  dim?: boolean;
  highlighted?: boolean;
  busy?: boolean;
  onAction: (kind: RowActionKind, release: Release) => void;
  onFocus?: () => void;
  rowRef?: (el: HTMLDivElement | null) => void;
};

/**
 * `.src[.rec][.dim][.on] > .q(quality + small fmt) + .d(.l1 tags + meta, .l2 file) + .act` — the mockup's srcRow(), as a
 * listbox `option` (roving tabindex: the highlighted row is the only tab stop). `.rec` = recommended cached row, or the
 * best row while it downloads (picker-progress mock). During a TorBox outage only rows with a cached link stay enabled.
 */
export function SourceRow({ release: r, episode, recommended, lastPick, dim, highlighted, busy, onAction, onFocus, rowRef }: Props) {
  const rec = recommended && (r.cacheState === "cached" || r.job?.state === "downloading");
  const disabled = dim && !r.linkReady;
  return (
    <div ref={rowRef} role="option" aria-selected={Boolean(highlighted)} className={cx("src", rec && "rec", dim && "dim", highlighted && "on")} data-hash={r.hash} data-cache={r.cacheState} data-play={r.playClass} data-job={r.job?.state} data-link-ready={r.linkReady || undefined} data-last-pick={lastPick || undefined} tabIndex={highlighted ? 0 : -1} onFocus={onFocus}>
      <div className="q">
        {r.qualityLabel}
        <small>{r.formatLabel}</small>
      </div>
      <div className="d">
        <div className="l1">
          <SourceRowBadges cacheState={r.cacheState} job={r.job} playClass={r.playClass} />
          {lastPick && <Tag kind="grey-outline">{copy.picker.lastPick}</Tag>} {rowMetaText(r, episode)}
        </div>
        <div className="l2" title={rowFileText(r)}>
          {rowFileText(r)}
        </div>
      </div>
      <div className="act">
        <SourceRowAction cacheState={r.cacheState} playClass={r.playClass} job={r.job} episode={r.pack ? episode : undefined} busy={busy} disabled={disabled} onAction={(kind) => onAction(kind, r)} />
      </div>
    </div>
  );
}
