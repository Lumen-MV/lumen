import "server-only";
import { cookies } from "next/headers";
import { SCENARIO_COOKIE } from "@/lib/auth/session-config";
import { devScenariosEnabled } from "@/lib/config/env";
import { parseScenarioCookie, type ScenarioFlag } from "./scenario-flags-shared";

/**
 * Scenario flags for code that has no Request object (server components, service clients).
 * Outside a request scope (e.g. background cache revalidation) `cookies()` throws → empty set.
 * Always empty unless LUMEN_SCENARIOS=1 (never in prod).
 */
export async function currentScenario(): Promise<Set<ScenarioFlag>> {
  if (!devScenariosEnabled()) return new Set();
  try {
    const store = await cookies();
    return parseScenarioCookie(store.get(SCENARIO_COOKIE)?.value);
  } catch {
    return new Set();
  }
}
