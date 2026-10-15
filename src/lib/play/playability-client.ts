/**
 * Browser-side refinement of the server's playClass (phase-04 Key Insights): `canPlayType` for the file's container /
 * codec. Pure given a probe function so it is unit-testable; the player passes `document.createElement("video")`.
 */
export type CanPlay = (mime: string) => string;

const CODEC_MIME: Record<string, string> = {
  "H.264": 'video/mp4; codecs="avc1.640028, mp4a.40.2"',
  x264: 'video/mp4; codecs="avc1.640028, mp4a.40.2"',
  x265: 'video/mp4; codecs="hvc1.1.6.L153.B0, mp4a.40.2"',
  HEVC: 'video/mp4; codecs="hvc1.1.6.L153.B0, mp4a.40.2"',
  av1: 'video/mp4; codecs="av01.0.08M.08, mp4a.40.2"',
};

export type ClientPlayability = "yes" | "maybe" | "no";

/**
 * MP4 + H.264 → yes everywhere; MKV → the browser must know `video/x-matroska` (Chromium/Android: "maybe"; Safari: "")
 * → "no" short-circuits to the codec dialog without trying; HEVC/AV1 depend on the platform decoder.
 */
export function clientPlayability(container: string, codec: string, canPlay: CanPlay): ClientPlayability {
  const c = container.toUpperCase();
  if (c === "MKV") {
    const mkv = canPlay("video/x-matroska");
    if (mkv === "") return "no";
    return "maybe";
  }
  const mime = CODEC_MIME[codec] ?? CODEC_MIME["H.264"];
  const answer = canPlay(mime);
  if (answer === "probably") return "yes";
  if (answer === "maybe") return "maybe";
  return codec === "H.264" || codec === "x264" || codec === "" ? "maybe" : "no";
}

export const browserCanPlay: CanPlay = (mime) => (typeof document === "undefined" ? "" : document.createElement("video").canPlayType(mime));

/** Chromium / WebKit expose decoded audio bytes; Firefox has `mozHasAudio`; null = unknown (watchdog stays quiet). */
export function decodedAudioBytes(video: HTMLVideoElement): number | null {
  const v = video as HTMLVideoElement & { webkitAudioDecodedByteCount?: number; mozHasAudio?: boolean };
  if (typeof v.webkitAudioDecodedByteCount === "number") return v.webkitAudioDecodedByteCount;
  if (typeof v.mozHasAudio === "boolean") return v.mozHasAudio ? 1 : 0;
  return null;
}

export const isIphone = (ua: string): boolean => /iphone|ipod/i.test(ua);
