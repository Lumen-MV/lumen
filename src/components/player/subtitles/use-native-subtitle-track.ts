"use client";
import { useEffect, useRef, useState, type RefObject } from "react";
import { applyNativeCueOffset, nativeTrackMode, nextNativeFullscreen, type CueBaseTimes, type NativeFsEvent } from "@/lib/subtitles/native-track-mode";

type IosVideo = HTMLVideoElement & { webkitDisplayingFullscreen?: boolean };

/**
 * Drives the real `<track>` rendered inside `<video>` for the selected subtitle (see native-track-mode.ts): mode
 * `hidden` normally (cues load, the DOM band renders), `showing` while the video element is in the system full screen
 * (iPhone), back to `hidden` on exit; a track swap while full screen re-applies the mode on the new element; "Tắt"
 * renders no track. The viewer's offset is applied to the native cues on every change and again when a track loads.
 */
export function useNativeSubtitleTrack(videoRef: RefObject<HTMLVideoElement | null>, vttUrl: string | null, offsetMs: number) {
  const trackRef = useRef<HTMLTrackElement>(null);
  const [nativeFullscreen, setNativeFullscreen] = useState(false);
  const base = useRef<CueBaseTimes>(new WeakMap());
  const offsetRef = useRef(offsetMs);
  offsetRef.current = offsetMs;

  useEffect(() => {
    const v = videoRef.current as IosVideo | null;
    if (!v) return;
    const handler = (e: Event) => setNativeFullscreen(nextNativeFullscreen(e.type as NativeFsEvent, { fullscreenElementIsVideo: document.fullscreenElement === v, webkitDisplayingFullscreen: Boolean(v.webkitDisplayingFullscreen) }));
    v.addEventListener("webkitbeginfullscreen", handler);
    v.addEventListener("webkitendfullscreen", handler);
    document.addEventListener("fullscreenchange", handler);
    return () => {
      v.removeEventListener("webkitbeginfullscreen", handler);
      v.removeEventListener("webkitendfullscreen", handler);
      document.removeEventListener("fullscreenchange", handler);
    };
  }, [videoRef]);

  // mode follows the full-screen flag; keyed on the URL too because a new <track> element starts `disabled`
  useEffect(() => {
    const t = trackRef.current?.track;
    if (!t || !vttUrl) return;
    const mode = nativeTrackMode(nativeFullscreen);
    if (t.mode !== mode) t.mode = mode;
  }, [vttUrl, nativeFullscreen]);

  // offset: now, and once the cues arrive (the `load` event of the <track> element)
  useEffect(() => {
    const el = trackRef.current;
    if (!el || !vttUrl) return;
    const apply = () => {
      const cues = el.track.cues;
      if (cues) applyNativeCueOffset(Array.from(cues), base.current, offsetRef.current);
    };
    apply();
    el.addEventListener("load", apply);
    return () => el.removeEventListener("load", apply);
  }, [vttUrl, offsetMs]);

  return { trackRef, nativeFullscreen };
}
