import "server-only";
import { getEnv } from "@/lib/config/env";
import { buildUserPayload, parseTranslation, SYSTEM_PROMPT } from "./translate-prompt";
import { TranslatorUnavailableError, type Translator } from "./translator-interface";

/**
 * Kie.ai OpenAI-compatible Responses API (spike payload shape): `POST {KIE_BASE_URL}/openai/v1/responses`,
 * `model` = KIE_MODEL (deepseek-v4-1-flash), `text.format.type = json_object`, `reasoning.effort = none`, no temperature.
 */
const TIMEOUT_MS = 90_000;
let fetchImpl: typeof fetch = (...a) => fetch(...a);
export const setKieFetch = (f: typeof fetch | null) => void (fetchImpl = f ?? ((...a) => fetch(...a)));

type ResponsesJson = { code?: number; msg?: string; output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }>; usage?: { input_tokens?: number; output_tokens?: number } };

export function responsesText(json: ResponsesJson): string {
  if (typeof json.output_text === "string" && json.output_text) return json.output_text;
  const parts: string[] = [];
  for (const o of json.output ?? []) for (const c of o.content ?? []) if (c.type === "output_text" && c.text) parts.push(c.text);
  return parts.join("");
}

export function kieTranslator(): Translator {
  return {
    name: "kie",
    async translate(items, ctx) {
      const env = getEnv();
      const base = env.KIE_BASE_URL.replace(/\/$/, "");
      const body = { model: env.KIE_MODEL, stream: false, reasoning: { effort: "none" }, text: { format: { type: "json_object" } }, input: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: buildUserPayload(items, ctx) }] };
      let res: Response;
      try {
        res = await fetchImpl(`${base}/openai/v1/responses`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.KIE_API_KEY}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS) });
      } catch (err) {
        throw new TranslatorUnavailableError(`Kie unreachable: ${err instanceof Error ? err.name : "error"}`);
      }
      const raw = await res.text();
      if (!res.ok) throw new TranslatorUnavailableError(`Kie ${res.status}`, res.status);
      let json: ResponsesJson;
      try {
        json = JSON.parse(raw) as ResponsesJson;
      } catch {
        throw new TranslatorUnavailableError("Kie: non-JSON envelope");
      }
      if (json.code && json.code !== 200) throw new TranslatorUnavailableError(`Kie code ${json.code}`, json.code);
      const text = responsesText(json);
      if (!text) throw new TranslatorUnavailableError("Kie: empty output");
      const usage = json.usage ? { inputTokens: Number(json.usage.input_tokens ?? 0), outputTokens: Number(json.usage.output_tokens ?? 0) } : null;
      return { lines: parseTranslation(text, items), usage };
    },
  };
}
