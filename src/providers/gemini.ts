/** Google Gemini generateContent. The key goes in the x-goog-api-key header (not the URL).
 *  JSON via generationConfig.responseMimeType. */

import { buildSystemPrompt, buildUserPrompt } from "../prompt";
import { postJson } from "../lib/http";
import { parseModelOutput } from "../lib/parse";
import { TranslateError } from "../lib/errors";
import type { TranslateOptions, TranslateResult } from "./types";

function endpoint(model: string): string {
  // `model` comes from a user-editable preference; encodeURIComponent keeps it
  // inside the path segment (no host/path injection).
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
      `Gemini blocked the request: ${json.promptFeedback.blockReason}.`,
    );
  }

  const text = (json.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("");
  if (text.trim() === "") {
    throw new TranslateError("parse", "Gemini returned an empty response.");
  }

  return parseModelOutput(text);
}
