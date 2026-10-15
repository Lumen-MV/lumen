import "server-only";
import { getEnv } from "@/lib/config/env";
import { buildUserPayload, parseTranslation, SYSTEM_PROMPT } from "./translate-prompt";
import { TranslatorUnavailableError, type Translator } from "./translator-interface";

/** Anthropic Messages API (Claude Haiku) — alternative backend; same prompt, JSON answer requested in the system text. */
const URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5";
const TIMEOUT_MS = 60_000;
let fetchImpl: typeof fetch = (...a) => fetch(...a);
export const setClaudeFetch = (f: typeof fetch | null) => void (fetchImpl = f ?? ((...a) => fetch(...a)));

export function claudeTranslator(): Translator {
  return {
    name: "claude",
    async translate(items, ctx) {
      const body = { model: MODEL, max_tokens: 8000, temperature: 0.2, system: SYSTEM_PROMPT, messages: [{ role: "user", content: buildUserPayload(items, ctx) }] };
      let res: Response;
      try {
        res = await fetchImpl(URL, { method: "POST", headers: { "Content-Type": "application/json", "x-api-key": getEnv().ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" }, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS) });
      } catch (err) {
        throw new TranslatorUnavailableError(`Claude unreachable: ${err instanceof Error ? err.name : "error"}`);
      }
      if (!res.ok) throw new TranslatorUnavailableError(`Claude ${res.status}`, res.status);
      const json = (await res.json().catch(() => null)) as { content?: Array<{ type?: string; text?: string }>; usage?: { input_tokens?: number; output_tokens?: number } } | null;
      const text = (json?.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
      if (!text) throw new TranslatorUnavailableError("Claude: empty output");
      const usage = json?.usage ? { inputTokens: Number(json.usage.input_tokens ?? 0), outputTokens: Number(json.usage.output_tokens ?? 0) } : null;
      return { lines: parseTranslation(text, items), usage };
    },
  };
}
