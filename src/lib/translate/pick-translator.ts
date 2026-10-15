import "server-only";
import { getEnv } from "@/lib/config/env";
import type { ScenarioFlag } from "@/lib/dev/scenario-flags-shared";
import { claudeTranslator } from "./claude-translator";
import { deepseekTranslator } from "./deepseek-translator";
import { fakeTranslator } from "./fake-translator";
import { kieTranslator } from "./kie-deepseek-translator";
import type { Translator } from "./translator-interface";

/**
 * TRANSLATOR=kie (default) | deepseek | claude, falling back to whichever key exists. Dev scenarios override:
 * `kie-down` / `subs-sim` → the free fake (screenshots / UX tests never spend money; the job runner cuts kie-down at 40 %).
 */
export function pickTranslator(scenario: Set<ScenarioFlag>): Translator | null {
  if (scenario.has("kie-down") || scenario.has("subs-sim")) return fakeTranslator();
  const env = getEnv();
  const order: Array<["kie" | "deepseek" | "claude", boolean, () => Translator]> = [["kie", Boolean(env.KIE_API_KEY), kieTranslator], ["deepseek", Boolean(env.DEEPSEEK_API_KEY), deepseekTranslator], ["claude", Boolean(env.ANTHROPIC_API_KEY), claudeTranslator]];
  const preferred = order.find(([name, ok]) => name === env.TRANSLATOR && ok);
  const any = order.find(([, ok]) => ok);
  return (preferred ?? any)?.[2]() ?? null;
}
