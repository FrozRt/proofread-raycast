/**
 * Core proofreading contract.
 *
 * The core (prompt/lib/providers) does NOT import `@raycast/api`: providers
 * receive apiKey/model as explicit arguments (DI), so the same `proofread()`
 * runs both in the UI and headless in scripts/eval.ts. The app uses Gemini only.
 */

export interface ProofreadOptions {
  apiKey: string;
  model: string;
  /** false = keep the author's register; true = rewrite into a polished formal register. */
  formal: boolean;
  /** Optional external cancellation (the provider adds its own on timeout). */
  signal?: AbortSignal;
}

export interface ProofreadResult {
  /** The corrected text (author's wording/tone preserved, protected tokens kept verbatim). */
  text: string;
}
