/** Google Gemini generateContent. Ключ — в заголовке x-goog-api-key (не в URL).
 *  JSON через generationConfig.responseMimeType. */

import { buildSystemPrompt, buildUserPrompt } from "../prompt";
import { postJson } from "../lib/http";
import { parseModelOutput } from "../lib/parse";
import { TranslateError } from "../lib/errors";
import type { TranslateOptions, TranslateResult } from "./types";

function endpoint(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  promptFeedback?: { blockReason?: string };
}

export async function translateWithGemini(
  input: string,
  opts: TranslateOptions,
): Promise<TranslateResult> {
  const body = {
    systemInstruction: { parts: [{ text: buildSystemPrompt(opts) }] },
    contents: [{ role: "user", parts: [{ text: buildUserPrompt(input) }] }],
    generationConfig: { responseMimeType: "application/json" },
  };

  const json = (await postJson({
    url: endpoint(opts.model),
    headers: { "x-goog-api-key": opts.apiKey },
    body,
    label: "Gemini",
    signal: opts.signal,
  })) as GeminiResponse;

  if (json.promptFeedback?.blockReason) {
    throw new TranslateError(
      "api",
      `Gemini заблокировал запрос: ${json.promptFeedback.blockReason}.`,
    );
  }

  const text = (json.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("");
  if (text.trim() === "") {
    throw new TranslateError("parse", "Gemini вернул пустой ответ.");
  }

  return parseModelOutput(text);
}
