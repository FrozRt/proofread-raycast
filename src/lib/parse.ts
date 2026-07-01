/**
 * Parsing of the model's output.
 *
 * The proofreader is asked to return the corrected text ONLY — plain text, no
 * JSON, no notes, no code fences. Models occasionally wrap the answer in ```
 * fences or add surrounding quotes anyway, so we strip those defensively before
 * handing the text back.
 */

import type { ProofreadResult } from "../providers/types";

/** Strip a single wrapping ```/```json code fence if the model added one. */
function stripCodeFences(text: string): string {
  const fenced = text.match(/```(?:json|text)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}

/** Strip a single pair of matching wrapping quotes the model may have added. */
function stripWrappingQuotes(text: string): string {
  const pairs: Array<[string, string]> = [
    ['"', '"'],
    ["'", "'"],
    ["“", "”"], // “ ”
    ["«", "»"], // « »
  ];
  for (const [open, close] of pairs) {
    if (text.length >= 2 && text.startsWith(open) && text.endsWith(close)) {
      const inner = text.slice(open.length, text.length - close.length);
      // Only unwrap if there's no other matching delimiter inside (avoid eating
      // a legitimately quoted phrase that spans the whole text).
      if (!inner.includes(open) && !inner.includes(close)) {
        return inner.trim();
      }
    }
  }
  return text;
}

export function parseModelOutput(raw: string): ProofreadResult {
  const text = stripWrappingQuotes(stripCodeFences((raw ?? "").trim()));
  return { text };
}
