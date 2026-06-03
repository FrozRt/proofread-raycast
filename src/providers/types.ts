/**
 * Core translation contract.
 *
 * The core (prompt/lib/providers) does NOT import `@raycast/api`: providers
 * receive apiKey/model as explicit arguments (DI), so the same `translate()`
 * runs both in the UI and headless in scripts/eval.ts. The app uses Gemini only.
 */

export interface TranslateOptions {
  apiKey: string;
  model: string;
  /** Language of the explanation block (e.g. "Russian"). */
  explanationLanguage: string;
  /** Force the block even for simple phrases (the alwaysExplain preference). */
  alwaysExplain: boolean;
  /** Optional external cancellation (the provider adds its own on timeout). */
  signal?: AbortSignal;
}

export interface TranslateResult {
  /** The translation (protected tokens kept verbatim). */
  translation: string;
  /** Ready-to-render markdown block, or null when the §3 rules say it isn't needed. */
  explanation: string | null;
}
