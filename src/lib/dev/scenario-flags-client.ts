"use client";
import { parseScenarioCookie, type ScenarioFlag } from "./scenario-flags-shared";
import { SCENARIO_COOKIE } from "@/lib/auth/session-config";

/**
 * Browser-side read of the (non-httpOnly) lumen_scenario cookie. The cookie is only ever set by
 * /api/dev/scenario, which 404s unless LUMEN_SCENARIOS=1, so in prod this is always empty.
 */
export function readScenarioClient(): Set<ScenarioFlag> {
  if (typeof document === "undefined") return new Set();
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${SCENARIO_COOKIE}=([^;]*)`));
  return parseScenarioCookie(m?.[1]);
}
