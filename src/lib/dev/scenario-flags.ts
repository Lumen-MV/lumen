import { SCENARIO_COOKIE } from "@/lib/auth/session-config";
import { devScenariosEnabled } from "@/lib/config/env";
import { parseScenarioCookie, parseScenarioParams, type ScenarioFlag } from "./scenario-flags-shared";

export { SCENARIO_FLAGS, SCENARIO_ENTRY_RE, parseScenarioCookie, type ScenarioFlag } from "./scenario-flags-shared";

function cookieValue(req: Request): string | undefined {
  if (!devScenariosEnabled()) return undefined;
  const cookie = req.headers.get("cookie") ?? "";
  return cookie.match(new RegExp(`(?:^|;\\s*)${SCENARIO_COOKIE}=([^;]*)`))?.[1];
}

/** Server: flags from the request cookie; always empty unless LUMEN_SCENARIOS=1 (never in prod). */
export function readScenario(req: Request): Set<ScenarioFlag> {
  return parseScenarioCookie(cookieValue(req));
}

/** Server: flag parameters (`cloud-sim=<spec>`) from the request cookie; empty unless LUMEN_SCENARIOS=1. */
export function readScenarioParams(req: Request): Map<ScenarioFlag, string> {
  return parseScenarioParams(cookieValue(req));
}
