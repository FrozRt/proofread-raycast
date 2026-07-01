import { runProofread } from "./run-proofread";

/**
 * Proofread Formal (no-view): fix mechanics and rewrite the selected text into a
 * polished formal register, then paste it back in place.
 */
export default async function Command() {
  await runProofread(true);
}
