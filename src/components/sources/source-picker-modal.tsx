"use client";
import * as RD from "@radix-ui/react-dialog";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { onActivate } from "@/components/ui/activate-key";
import { useToast } from "@/components/ui/toast-provider";
import { copy } from "@/lib/copy-vi";
import { cx } from "@/lib/format/class-names";
import { sortReleases, type SortKey } from "@/lib/sources/release-scorer";
import type { Release } from "@/lib/sources/sources-types";
import { shortFileName } from "./short-file-name";
import { SourcePickerBanner } from "./source-picker-banner";
import { SourcePickerEmpty } from "./source-picker-empty";
import { SourcePickerSkeleton } from "./source-picker-skeleton";
import { SourceRow } from "./source-row";
import { primaryRowAction, type RowActionKind } from "./source-row-action";
import { useSources, withLiveJobs } from "./sources-provider";

/**
 * `.modal > .box > .hd(h3 + .toggle + ✕) + .filt(chips + .sort menu) + [banner] + listbox rows | skeleton | empty + .ft` — picker()
 * from screen-detail.js; ≤ 700 px the mockup CSS turns it into a bottom sheet. Focus lands on the highlighted row (never the
 * 4K switch); rows are `option`s with a roving tabindex: ↑/↓ move highlight + focus, Enter/Space = that row's primary action,
 * Esc closes (Radix). Chips/toggle answer Enter + Space on their own. Progress is announced on 10 % steps (aria-live).
 */
type Filter = "all" | "direct" | "cached";
const FILTERS: Array<[Filter, string]> = [["all", copy.picker.filterAll], ["direct", copy.picker.filterDirect], ["cached", copy.picker.filterCached]];
const SORTS: SortKey[] = ["recommended", "size", "seeders"];
const isRow = (el: EventTarget | null): el is HTMLElement => el instanceof HTMLElement && el.dataset.hash !== undefined;

export function SourcePickerModal() {
  const s = useSources();
  const { toast } = useToast();
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<SortKey>("recommended");
  const [highlight, setHighlight] = useState<string | null>(null);
  const [requested, setRequested] = useState(false);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const contentRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<string | null>(null);
  highlightRef.current = highlight;

  const rows = useMemo(() => {
    const live = withLiveJobs(s.data?.releases ?? [], s.jobs);
    const filtered = live.filter((r) => (filter === "direct" ? r.playClass === "direct" : filter === "cached" ? r.cacheState === "cached" : true));
    return sortReleases(filtered, sort);
  }, [s.data, s.jobs, filter, sort]);
  const allUncached = rows.length > 0 && rows.every((r) => r.cacheState === "uncached" && !r.job);
  const down = s.data?.state === "torbox-down";
  const episode = s.episode?.episode;
  const bestHash = s.data?.best?.hash;
  const preferredHash = s.data?.preferredHash ?? null;

  /** Focus a row unless the viewer is on a chip / toggle / button inside the dialog. */
  const focusRow = useCallback((hash: string | null) => {
    const el = hash ? rowRefs.current.get(hash) : null;
    const box = contentRef.current;
    const active = document.activeElement;
    const onControl = active && box?.contains(active) && active !== box && !isRow(active);
    if (el && !onControl) el.focus({ preventScroll: true });
    else if (!el && !onControl) box?.focus();
    el?.scrollIntoView({ block: "nearest" });
  }, []);

  // open / list change → highlight the requested row (else the primary = "Lần trước" when it applies, else the recommended one), focus + scroll it into view
  useEffect(() => {
    if (!s.pickerOpen) return;
    const target = s.highlightHash ?? (s.data?.preferredApplies ? s.primary?.hash : undefined) ?? rows.find((r) => r.recommended)?.hash ?? rows[0]?.hash ?? null;
    setHighlight(target);
    const t = setTimeout(() => focusRow(target), 0);
    return () => clearTimeout(t);
  }, [s.pickerOpen, s.highlightHash, s.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = useCallback(
    (kind: RowActionKind, r: Release) => {
      // an explicit row pick (play / app / cloud) becomes the title's "Lần trước"; cancel / retry / other are not picks
      if (kind === "play" || kind === "app" || kind === "cloud") void s.actions.remember(r);
      if (kind === "play") void s.actions.play(r);
      else if (kind === "app") void s.actions.app(r);
      else if (kind === "cloud") void s.actions.cloud(r);
      else if (kind === "cancel" && r.job) s.requestCancel(r.job);
      else if (kind === "retry" && r.job) void s.actions.retry(r.job);
      else if (kind === "other") setHighlight(rows.find((x) => x.hash !== r.hash && x.cacheState === "cached")?.hash ?? null);
    },
    [s, rows],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    // chips, the 4K switch, buttons and the Radix sort menu handle their own keys (they call preventDefault)
    if (e.defaultPrevented || !rows.length) return;
    const i = rows.findIndex((r) => r.hash === highlight);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))];
      setHighlight(next.hash);
      rowRefs.current.get(next.hash)?.focus({ preventScroll: true });
      rowRefs.current.get(next.hash)?.scrollIntoView({ block: "nearest" });
    } else if ((e.key === "Enter" || e.key === " ") && i >= 0 && (isRow(e.target) || e.target === e.currentTarget)) {
      e.preventDefault();
      const r = rows[i];
      if (down && !r.linkReady) return;
      act(primaryRowAction(r.cacheState, r.playClass, r.job), r);
    }
  };

  const request = async () => {
    try {
      const r = await fetch("/api/sources/request", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mediaKey: s.mediaKey }) });
      if (!r.ok && r.status !== 429) throw new Error(`request ${r.status}`);
      setRequested(true); // 429 = already sent within the minute → same outcome
      toast({ type: "success", text: copy.picker.requested });
    } catch (err) {
      console.warn("[request]", err);
      toast({ type: "err", text: copy.home.errRow });
    }
  };

  const title = s.episode ? copy.picker.titleEp(s.episode.season, s.episode.episode) : copy.picker.title(s.title);
  const hasPack = rows.some((r) => r.pack);
  const live = rows.find((r) => r.job?.state === "downloading");
  const liveText = live?.job ? copy.picker.liveProgress(shortFileName(live.fileName ?? live.title), Math.floor(live.job.progress / 10) * 10) : "";
  const sortItems = SORTS.map((k, i) => ({ label: copy.picker.sorts[i], onSelect: () => setSort(k) }));
  return (
    <RD.Root open={s.pickerOpen} onOpenChange={(o) => !o && s.closePicker()}>
      <RD.Portal>
        <RD.Overlay className="modal">
          <RD.Content ref={contentRef} className="box" aria-describedby={undefined} onKeyDown={onKeyDown} onOpenAutoFocus={(e) => e.preventDefault()} data-status={s.status} data-state-sources={s.data?.state}>
            <div className="hd">
              <RD.Title asChild>
                <h3>{title}</h3>
              </RD.Title>
              <span className="toggle" role="switch" aria-checked={s.show4k} tabIndex={0} data-toggle="4k" onClick={() => s.setShow4k(!s.show4k)} onKeyDown={onActivate(() => s.setShow4k(!s.show4k))}>
                {copy.picker.show4k} <i style={s.show4k ? { background: "#46d369" } : undefined} />
              </span>
              <RD.Close asChild>
                <button type="button" className="x" aria-label={copy.common.close}>{copy.picker.closeGlyph}</button>
              </RD.Close>
            </div>
            <div className="filt">
              {FILTERS.map(([k, label]) => (
                <span key={k} className={cx(k === filter && "on")} role="button" tabIndex={0} aria-pressed={k === filter} data-filter={k} onClick={() => setFilter(k)} onKeyDown={onActivate(() => setFilter(k))}>
                  {label}
                </span>
              ))}
              <DropdownMenu
                items={sortItems}
                // after choosing a sort, keyboard focus goes back to the highlighted row so ↑/↓ keep walking the list (not the trigger, which would reopen the menu)
                onCloseAutoFocus={(e) => {
                  e.preventDefault();
                  rowRefs.current.get(highlightRef.current ?? "")?.focus({ preventScroll: true });
                }}
                anchor={<span className="sort" role="button" tabIndex={0} aria-label={copy.picker.sortMenu} data-sort={sort}>{copy.picker.sort(copy.picker.sorts[SORTS.indexOf(sort)])}</span>}
              />
            </div>
            <span className="sr-only" aria-live="polite">{liveText}</span>
            {down && <SourcePickerBanner kind="torbox-down" onRetry={s.reload} />}
            {!down && allUncached && s.status === "ready" && <SourcePickerBanner kind="all-uncached" onRetry={s.reload} />}
            {s.status === "loading" && <SourcePickerSkeleton />}
            {s.status !== "loading" && rows.length === 0 && <SourcePickerEmpty onRetry={s.reload} onRequest={request} requested={requested} />}
            {s.status === "ready" && rows.length > 0 && (
              <div role="listbox" aria-label={title}>
                {rows.map((r) => (
                  <SourceRow key={r.hash} release={r} episode={episode} recommended={r.recommended || (r.hash === bestHash && r.job?.state === "downloading")} lastPick={r.hash === preferredHash} dim={down} highlighted={r.hash === highlight} busy={s.actions.busyHash === r.hash} onAction={act} onFocus={() => setHighlight(r.hash)} rowRef={(el) => (el ? rowRefs.current.set(r.hash, el) : rowRefs.current.delete(r.hash))} />
                ))}
              </div>
            )}
            <div className="ft">
              {hasPack ? copy.picker.legendPack : copy.picker.legend}
              {preferredHash && (
                <>
                  {" "}
                  <a role="button" tabIndex={0} data-action="forget-pref" style={{ color: "#aaa", textDecoration: "underline", cursor: "pointer", whiteSpace: "nowrap" }} onClick={() => void s.actions.forget()} onKeyDown={onActivate(() => void s.actions.forget())}>
                    {copy.picker.forgetPick}
                  </a>
                </>
              )}
            </div>
          </RD.Content>
        </RD.Overlay>
      </RD.Portal>
    </RD.Root>
  );
}
