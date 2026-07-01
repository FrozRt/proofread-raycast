/** Google Gemini generateContent. The key goes in the x-goog-api-key header (not the URL). */

import { buildSystemPrompt, buildUserPrompt } from "../prompt";
import { postJson } from "../lib/http";
import { parseModelOutput } from "../lib/parse";
import { ProofreadError } from "../lib/errors";
import type { ProofreadOptions, ProofreadResult } from "./types";

/**
 * A generous output-token cap for a proofread. The corrected text is roughly the
 * length of the input, so we estimate tokens from characters (~1 token per 3
 * chars, headroom for multi-byte scripts) and pad it, with a sane floor so short
 * inputs still get plenty of room.
 */
function outputCap(input: string): number {
  const estimatedTokens = Math.ceil(input.length / 3);
  return Math.max(256, estimatedTokens * 2);
}

function endpoint(model: string): string {
  // `model` comes from a user-editable preference; encodeURIComponent keeps it
  // inside the path segment (no host/path injection).
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  promptFeedback?: { blockReason?: string };
}

export async function proofreadWithGemini(
  input: string,
  opts: ProofreadOptions,
): Promise<ProofreadResult> {
  const body = {
    systemInstruction: {
      parts: [{ text: buildSystemPrompt({ formal: opts.formal }) }],
    },
    contents: [{ role: "user", parts: [{ text: buildUserPrompt(input) }] }],
    generationConfig: {
      // Proofreading is mechanical — no reasoning needed. thinkingBudget: 0
      // disables Gemini 2.5 Flash's "thinking" phase, roughly halving latency
      // with no quality loss for grammar/spelling fixes. (Ignored by models
      // that don't support thinking, so it's safe across model choices.)
      thinkingConfig: { thinkingBudget: 0 },
      // The corrected text is ~the length of the input; cap output so the model
      // can't ramble, sized generously off the input length.
      maxOutputTokens: outputCap(input),
    },
  };

  const json = (await postJson({
    url: endpoint(opts.model),
    headers: { "x-goog-api-key": opts.apiKey },
    body,
    label: "Gemini",
    signal: opts.signal,
  })) as GeminiResponse;

  if (json.promptFeedback?.blockReason) {
    throw new ProofreadError(
      "api",
      `Gemini blocked the request: ${json.promptFeedback.blockReason}.`,
    );
  }

  const text = (json.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("");
  if (text.trim() === "") {
    throw new ProofreadError("parse", "Gemini returned an empty response.");
  }

  return parseModelOutput(text);
}
