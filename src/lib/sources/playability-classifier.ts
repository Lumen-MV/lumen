import type { ParsedRelease, PlayClass } from "./sources-types";

/**
 * Direct-play classes (no remux, no transcode — the browser plays the TorBox CDN file as-is):
 *   direct = MP4/M4V + AAC (or no audio tag, YTS-style)        → "▶ Phát"
 *   maybe  = MKV + x264/x265 + AAC/Opus                        → "▶ Thử phát" (Chrome / Android)
 *   app    = DTS / TrueHD / AC3 / E-AC3 / DDP / Atmos / FLAC audio, AVI/TS container, REMUX, AV1, unknown
 * `playReason` is the mockup's "(MKV DTS)" style explanation shown in the detail facts.
 */
const APP_AUDIO = new Set(["DTS", "DTS-HD", "TrueHD", "AC3", "DDP", "FLAC"]);
const BROWSER_AUDIO = new Set(["AAC", "Opus", "MP3"]);

export type Playability = { playClass: PlayClass; playReason: string };

export function classifyPlayability(p: ParsedRelease): Playability {
  const audioCodec = p.audio.find((a) => APP_AUDIO.has(a) || BROWSER_AUDIO.has(a));
  const atmos = p.audio.includes("Atmos");
  const containerLabel = p.container === "unknown" ? "" : p.container.toUpperCase();
  const reasons: string[] = [];
  if (p.container === "avi" || p.container === "ts") reasons.push(containerLabel);
  if (p.source === "REMUX") reasons.push("REMUX");
  if (p.codec === "av1") reasons.push("AV1");
  if (audioCodec && APP_AUDIO.has(audioCodec)) reasons.push(audioCodec === "DDP" && atmos ? "DDP Atmos" : audioCodec);
  else if (!audioCodec && atmos) reasons.push("Atmos");
  if (reasons.length) {
    const why = p.container === "mkv" && !reasons.includes("MKV") ? ["MKV", ...reasons] : reasons;
    return { playClass: "app", playReason: why.join(" ") };
  }
  const browserAudio = !audioCodec || BROWSER_AUDIO.has(audioCodec);
  if (p.container === "mp4" && browserAudio) return { playClass: "direct", playReason: "" };
  if (p.container === "mkv" && (p.codec === "x264" || p.codec === "x265") && browserAudio) return { playClass: "maybe", playReason: "MKV" };
  // unknown container / codec: only a known MP4 group is trusted as direct; everything else needs the app
  if (p.container === "unknown" && p.codec !== "" && browserAudio) return { playClass: "maybe", playReason: "" };
  return { playClass: "app", playReason: [containerLabel || "?", p.codec.toUpperCase()].filter(Boolean).join(" ") };
}
