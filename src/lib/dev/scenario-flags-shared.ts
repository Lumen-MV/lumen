/**
 * Scenario flag names + cookie parser shared by server (scenario-flags.ts) and client (scenario-flags-client.ts). No env/db imports.
 * A flag may carry one parameter after `=`: `cloud-sim=downloading:60:20` (cloud-sim-torbox.ts), `play-sample[=ac3|mkv]` (resolve answers the
 * local ffmpeg sample: plain / AC3 audio → no-audio / MPEG-4+AC3 MKV → codec error), `link-expired[=fail]` (sample route 403s until the link
 * is refreshed; `fail` → refresh itself 503s), `stream-mode=proxy|direct` (overrides STREAM_MODE for QA),
 * `subs-sim=<popover state>` (Phase 5: deterministic subtitle rows + fake translator; `os-quota-zero` / `kie-down` combine with it).
 */
export const SCENARIO_FLAGS = ["torbox-down", "os-quota-zero", "slow-net", "all-uncached", "playback-fail", "kie-down", "link-expired", "tmdb-down", "tmdb-row-down", "offline", "cloud-sim", "play-sample", "stream-mode", "subs-sim"] as const;
export type ScenarioFlag = (typeof SCENARIO_FLAGS)[number];

/** `flag` or `flag=param` (param: letters, digits, `:`, `.`, `-`, `_`; never a comma — the cookie is comma-joined). */
export const SCENARIO_ENTRY_RE = new RegExp(`^(${SCENARIO_FLAGS.join("|")})(?:=([\\w.:-]{1,40}))?$`);

function entries(value: string | undefined): Array<[ScenarioFlag, string | undefined]> {
  if (!value) return [];
  const out: Array<[ScenarioFlag, string | undefined]> = [];
  for (const raw of decodeURIComponent(value).split(",")) {
    const m = raw.trim().match(SCENARIO_ENTRY_RE);
    if (m) out.push([m[1] as ScenarioFlag, m[2]]);
  }
  return out;
}

export function parseScenarioCookie(value: string | undefined): Set<ScenarioFlag> {
  return new Set(entries(value).map(([f]) => f));
}

/** Parameters of the parameterised flags (`cloud-sim=downloading:73` → Map { "cloud-sim" → "downloading:73" }). */
export function parseScenarioParams(value: string | undefined): Map<ScenarioFlag, string> {
  const map = new Map<ScenarioFlag, string>();
  for (const [f, p] of entries(value)) if (p !== undefined) map.set(f, p);
  return map;
}
