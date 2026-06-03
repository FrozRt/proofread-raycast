/**
 * Core entry point: `translate()`. Validates input/key and delegates to Gemini,
 * the app's only provider. The gemini.ts layer is kept as a seam: re-adding other
 * providers means restoring their modules from git history plus a dispatcher.
 */

import { TranslateError } from "../lib/errors";
import { translateWithGemini } from "./gemini";
import type { TranslateOptions, TranslateResult } from "./types";

/** Default Gemini model — fallback when the preference field is empty. */
export const DEFAULT_MODEL = "gemini-2.5-flash";

export async function translate(
  input: string,
  opts: TranslateOptions,
): Promise<TranslateResult> {
  const text = input.trim();
  if (text === "") {
    throw new TranslateError("empty", "Empty input — nothing to translate.");
  }
  if (opts.apiKey.trim() === "") {
    throw new TranslateError(
      "auth",
      "No Gemini API key set. It's free — get one at aistudio.google.com (Get API key).",
    );
  }

  return translateWithGemini(text, opts);
}

export type { TranslateOptions, TranslateResult } from "./types";
