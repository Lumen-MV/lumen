"use client";
import { useEffect, useState, type ReactNode, type RefObject } from "react";
import { useToast } from "@/components/ui/toast-provider";
import { copy } from "@/lib/copy-vi";
import { tokenizeCueMarkup } from "@/lib/subtitles/cue-markup";
import { activeCueTexts } from "@/lib/subtitles/cue-offset";
import { sourceLineFor } from "@/lib/subtitles/subtitle-track-ranking";
import { SUB_FONT_PX, type Cue, type SubSize, type SubTrack } from "@/lib/subtitles/subtitle-types";
import { parseVtt } from "@/lib/subtitles/vtt-parser";

type Props = { videoRef: RefObject<HTMLVideoElement | null>; track: SubTrack | null; offsetMs: number; size: SubSize; controlsHidden: boolean };
const MOBILE_QUERY = "(max-width:700px)";

/** One cue line → text nodes wrapped in real <i>/<b>/<u> elements (never HTML); every other tag was stripped. */
export function CueLine({ text }: { text: string }) {
  return (
    <>
      {tokenizeCueMarkup(text).map((seg, k) => {
        let node: ReactNode = seg.text;
        if (seg.u) node = <u>{node}</u>;
        if (seg.b) node = <b>{node}</b>;
        if (seg.i) node = <i>{node}</i>;
        return <span key={k}>{node}</span>;
      })}
    </>
  );
}

/**
 * `.subs` band (bottom 118 px, 60 px while the controls are hidden; the popover's `:has(.pop)` rule moves it to the top)
 * + `.sub-src` source line. The VTT is fetched (same-origin, session cookie) and parsed here so the offset and the
 * S/M/L size apply the same way on every browser; the active cues are looked up each animation frame while playing.
 * The fetch keys on the VTT URL only — a refreshed track list with the same selection never blanks the band.
 */
export function SubtitleBand({ videoRef, track, offsetMs, size, controlsHidden }: Props) {
  const { toast } = useToast();
  const [cues, setCues] = useState<Cue[]>([]);
  const [lines, setLines] = useState<string[]>([]);
  const [mobile, setMobile] = useState(false);
  const vttUrl = track?.vttUrl ?? null;

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    setCues([]);
    setLines([]);
    if (!vttUrl) return;
    let alive = true;
    fetch(vttUrl, { cache: "force-cache" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`vtt ${r.status}`);
        const parsed = parseVtt(await r.text());
        if (alive) setCues(parsed);
      })
      .catch((err) => {
        console.warn("[subs] load track", err instanceof Error ? err.message : err);
        if (alive) toast({ type: "err", text: copy.subs.loadFailedToast });
      });
    return () => {
      alive = false;
    };
  }, [vttUrl, toast]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !cues.length) return;
    let raf = 0;
    let last = "";
    const render = () => {
      const next = activeCueTexts(cues, v.currentTime * 1000, offsetMs).join("\n");
      if (next !== last) {
        last = next;
        setLines(next ? next.split("\n") : []);
      }
    };
    const loop = () => {
      render();
      if (!v.paused && !v.ended) raf = requestAnimationFrame(loop);
    };
    const start = () => {
      cancelAnimationFrame(raf);
      loop();
    };
    render();
    if (!v.paused) raf = requestAnimationFrame(loop);
    for (const e of ["play", "seeked", "timeupdate"]) v.addEventListener(e, start);
    return () => {
      cancelAnimationFrame(raf);
      for (const e of ["play", "seeked", "timeupdate"]) v.removeEventListener(e, start);
    };
  }, [cues, offsetMs, videoRef]);

  const fontSize = SUB_FONT_PX[mobile ? "mobile" : "desktop"][size];
  return (
    <>
      <div className={track?.ai ? "subs ai" : "subs"} data-slot="subtitles" data-track={track?.id ?? ""} data-size={size} style={{ fontSize, ...(controlsHidden ? { bottom: 60 } : {}) }} aria-live="off">
        {lines.map((l, i) => (
          <span key={i}>
            {i > 0 && <br />}
            <CueLine text={l} />
          </span>
        ))}
      </div>
      {track && !controlsHidden && <div className="sub-src">{sourceLineFor(track)}</div>}
    </>
  );
}
