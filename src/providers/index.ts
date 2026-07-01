/**
 * Core entry point: `proofread()`. Validates input/key and delegates to Gemini,
 * the app's only provider. The gemini.ts layer is kept as a seam: re-adding other
 * providers means restoring their modules from git history plus a dispatcher.
 */

import { ProofreadError } from "../lib/errors";
import { proofreadWithGemini } from "./gemini";
import type { ProofreadOptions, ProofreadResult } from "./types";

/** Default Gemini model — fallback when the preference field is empty. */
export const DEFAULT_MODEL = "gemini-2.5-flash";

export async function proofread(
  input: string,
  opts: ProofreadOptions,
): Promise<ProofreadResult> {
  const text = input.trim();
  if (text === "") {
    throw new ProofreadError("empty", "Empty input — nothing to proofread.");
  }
  if (opts.apiKey.trim() === "") {
    throw new ProofreadError(
      "auth",
      "No Gemini API key set. It's free — get one at aistudio.google.com (Get API key).",
    );
  }

  return proofreadWithGemini(text, opts);
}

export type { ProofreadOptions, ProofreadResult } from "./types";
