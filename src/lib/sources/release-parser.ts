import type { Codec, Container, ParsedRelease, Resolution } from "./sources-types";

/**
 * Release-name parser (pure, regex based — parse-torrent-title was dropped: its audio/HDR/group output needed
 * post-processing anyway and the fields the picker shows are exactly these). Fixture-tested in tests/release-parser.test.ts.
 */
// release names glue the channel count to the codec ("AAC5.1", "DDP5.1") → no trailing \b; a letter after the tag disqualifies it
const AUDIO_CODECS: Array<[RegExp, string]> = [
  [/\bTrueHD(?![a-z])/i, "TrueHD"],
  [/\bDTS[-. ]?HD(?:[-. ]?MA)?(?![a-z])/i, "DTS-HD"],
  [/\bDTS(?![a-z])/i, "DTS"],
  [/\b(?:DDPA|DDP|DD\+|E-?AC-?3|EAC3)(?![a-z])/i, "DDP"],
  [/\b(?:DD|AC-?3)(?![a-z])/i, "AC3"],
  [/\bAAC(?![a-z])/i, "AAC"],
  [/\bOpus(?![a-z])/i, "Opus"],
  [/\bFLAC(?![a-z])/i, "FLAC"],
  [/\bMP3(?![a-z])/i, "MP3"],
];
const CHANNELS_RE = /(?<!\d)([257])[. ]?([01])(?!\d)/;
const SOURCES: Array<[RegExp, string]> = [
  [/\bREMUX\b/i, "REMUX"],
  [/\b(?:BluRay|Blu-Ray|BDRip|BRRip|BDRemux)\b/i, "BluRay"],
  [/\bWEB-?DL\b/i, "WEB-DL"],
  [/\bWEB-?Rip\b/i, "WEBRip"],
  [/\bWEB\b/i, "WEB"],
  [/\bHDTV\b/i, "HDTV"],
  [/\b(?:HDCAM|CAMRip|CAM)\b/i, "CAM"],
  [/\b(?:HDTS|TELESYNC|TS)\b/, "TS"],
];
/** Known groups whose releases are always MP4 + AAC. */
export const MP4_GROUPS = /\b(YTS|YIFY)\b/i;

export function parseResolution(name: string): Resolution {
  if (/\b(2160p|4k|uhd)\b/i.test(name)) return "2160p";
  if (/\b1080[pi]\b/i.test(name)) return "1080p";
  if (/\b720p\b/i.test(name)) return "720p";
  return "SD";
}

function parseCodec(name: string): Codec {
  if (/\b(?:x265|hevc|h[. ]?265)\b/i.test(name)) return "x265";
  if (/\b(?:x264|h[. ]?264|avc)\b/i.test(name)) return "x264";
  if (/\bav1\b/i.test(name)) return "av1";
  return "";
}

function parseAudio(name: string): string[] {
  const out: string[] = [];
  for (const [re, label] of AUDIO_CODECS) {
    if (re.test(name)) {
      out.push(label);
      break;
    }
  }
  const ch = name.match(CHANNELS_RE);
  if (ch) out.push(`${ch[1]}.${ch[2]}`);
  if (/\bAtmos\b/i.test(name)) out.push("Atmos");
  return out;
}

function parseHdr(name: string): string[] {
  const out: string[] = [];
  if (/\b(?:DV|DoVi|Dolby[. ]?Vision)\b/i.test(name)) out.push("DV");
  if (/\bHDR10\+/i.test(name)) out.push("HDR10+");
  else if (/\bHDR(?:10)?\b/i.test(name)) out.push("HDR");
  return out;
}

/** Release group: trailing `-GROUP` (before an extension) or `[GROUP]`-style suffixes like `[YTS.MX]`, `[QxR]`. */
export function parseGroup(name: string): string {
  const base = name.replace(/\.(mkv|mp4|avi|m4v|ts)$/i, "").trim();
  const bracket = base.match(/\[([A-Za-z0-9]+)(?:\.[A-Za-z]{2,3})?\]\s*$/);
  if (bracket) return bracket[1];
  const dash = base.match(/-([A-Za-z0-9]+)(?:\[[^\]]*\])?$/);
  if (dash && !/^\d+$/.test(dash[1])) return dash[1];
  if (MP4_GROUPS.test(base)) return base.match(MP4_GROUPS)![1].toUpperCase();
  return "";
}

export function containerFromName(name: string | undefined): Container {
  const m = (name ?? "").match(/\.(mkv|mp4|m4v|avi|ts)\s*$/i);
  if (!m) return "unknown";
  const ext = m[1].toLowerCase();
  return ext === "m4v" ? "mp4" : (ext as Container);
}

const GENERIC_GROUP = /^(BluRay|Blu-Ray|WEB|WEB-?DL|WEB-?Rip|HDTV|REMUX|x264|x265|HEVC|AAC|AC3|DDP|\d+p|3D|HSBS)$/i;

/**
 * `fileName` (TorBox file list / Torrentio filename hint) decides the container and also feeds the tag parsing —
 * YTS-style titles ("Spider-Man No Way Home (2021) [1080p] [BluRay]") carry codec/audio only in the file name.
 * Container fallback: the name, else a known MP4 group ⇒ mp4.
 */
export function parseRelease(name: string, fileName?: string): ParsedRelease {
  const text = fileName ? `${name} ${fileName}` : name;
  const candidates = [parseGroup(name), fileName ? parseGroup(fileName) : ""].filter((g) => g && !GENERIC_GROUP.test(g));
  const group = candidates[0] ?? "";
  let container = containerFromName(fileName);
  if (container === "unknown") container = containerFromName(name);
  if (container === "unknown" && (MP4_GROUPS.test(text) || /\bmp4\b/i.test(text))) container = "mp4";
  // a trailing `-TS` / `-CAM` is a release group, not a telesync/cam tag → strip the group token before source detection
  const forSource = group ? text.replace(new RegExp(`-${group.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z0-9])`, "g"), "") : text;
  const source = SOURCES.find(([re]) => re.test(forSource))?.[1] ?? "";
  return {
    resolution: parseResolution(text),
    codec: parseCodec(text),
    audio: parseAudio(text),
    hdr: parseHdr(text),
    source,
    group,
    container,
    bad: source === "CAM" || source === "TS",
  };
}

/** Pack detection: `S04` (no episode), `Season 4`, `Stagione 4` / `COMPLETA` (it), `Сезон: 4`, `Complete`, `Full Show` without a `S04E01` token in the release name. */
export function isSeasonPack(name: string): boolean {
  if (/\bS\d{1,2}(?:E|x)\d{1,3}\b/i.test(name) || /\b\d{1,2}x\d{2}\b/.test(name)) return false;
  return /\bS\d{1,2}\b/i.test(name) || /\b(?:Season|Stagione|Staffel|Temporada)[. ]?\d{1,2}\b/i.test(name) || /Сезон/i.test(name) || /\b(Complete|COMPLETA|Full Show)\b/i.test(name);
}
