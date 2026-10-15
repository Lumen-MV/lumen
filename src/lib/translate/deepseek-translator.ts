import "server-only";
import { getEnv } from "@/lib/config/env";
import { buildUserPayload, parseTranslation, SYSTEM_PROMPT } from "./translate-prompt";
import { TranslatorUnavailableError, type Translator } from "./translator-interface";

/** DeepSeek direct (OpenAI-compatible chat completions, JSON mode, temperature 0.2) — alternative to Kie. */
const URL = "https://api.deepseek.com/chat/completions";
const TIMEOUT_MS = 60_000;
let fetchImpl: typeof fetch = (...a) => fetch(...a);
export const setDeepseekFetch = (f: typeof fetch | null) => void (fetchImpl = f ?? ((...a) => fetch(...a)));

export function deepseekTranslator(): Translator {
  return {
    name: "deepseek",
    async translate(items, ctx) {
      const env = getEnv();
      const body = { model: env.DEEPSEEK_MODEL, temperature: 0.2, response_format: { type: "json_object" }, messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: buildUserPayload(items, ctx) }] };
      let res: Response;
      try {
        res = await fetchImpl(URL, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.DEEPSEEK_API_KEY}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS) });
      } catch (err) {
        throw new TranslatorUnavailableError(`DeepSeek unreachable: ${err instanceof Error ? err.name : "error"}`);
      }
      if (!res.ok) throw new TranslatorUnavailableError(`DeepSeek ${res.status}`, res.status);
      const json = (await res.json().catch(() => null)) as { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } } | null;
      const text = json?.choices?.[0]?.message?.content;
      if (!text) throw new TranslatorUnavailableError("DeepSeek: empty output");
      const usage = json?.usage ? { inputTokens: Number(json.usage.prompt_tokens ?? 0), outputTokens: Number(json.usage.completion_tokens ?? 0) } : null;
      return { lines: parseTranslation(text, items), usage };
    },
  };
}
