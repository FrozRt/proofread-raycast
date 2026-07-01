import { runProofread } from "./run-proofread";

/**
 * Proofread (no-view): fix grammar/spelling/punctuation in the selected text,
 * keeping the author's wording and register, and paste it back in place.
 */
export default async function Command() {
  await runProofread(false);
}
