/**
 * The no-view command runner: proofread the SELECTED text in place, with no
 * window. On the hotkey it grabs the current selection (falling back to the
 * clipboard), fixes it, and pastes the corrected version back over the
 * selection — the whole interaction is a single HUD line.
 *
 * Both the plain and the formal no-view commands call this with a `formal` flag.
 */

import {
  Clipboard,
  getPreferenceValues,
  getSelectedText,
  showHUD,
} from "@raycast/api";
import { DEFAULT_MODEL, proofread } from "./providers";
import type { ProofreadOptions } from "./providers/types";
import { asProofreadError, type ProofreadError } from "./lib/errors";

/** Resolve preferences (manifest -> raycast-env.d.ts) into core options. */
function resolveOptions(formal: boolean): ProofreadOptions {
  const prefs = getPreferenceValues<Preferences>();
  return {
    apiKey: (prefs.apiKey ?? "").trim(),
    model: (prefs.model ?? "").trim() || DEFAULT_MODEL,
    formal,
  };
}

/**
 * Read the text to proofread: prefer the current selection so the result can be
 * pasted back in place; fall back to the clipboard when nothing is selected
 * (getSelectedText throws when there is no selection).
 */
async function readInput(): Promise<{ text: string; fromSelection: boolean }> {
  try {
    const selected = (await getSelectedText()).trim();
    if (selected !== "") {
      return { text: selected, fromSelection: true };
    }
  } catch {
    // No selection / the app doesn't expose one — fall through to the clipboard.
  }
  const clip = (await Clipboard.readText())?.trim() ?? "";
  return { text: clip, fromSelection: false };
}

/** Short, human HUD message for a failed run. */
function hudForError(error: ProofreadError): string {
  switch (error.kind) {
    case "empty":
      return "⚠️ Nothing to proofread — select some text or copy it first";
    case "auth":
      return "⚠️ Set your Gemini API key in the extension preferences";
    case "rateLimit":
      return "⚠️ Rate limit — wait a few seconds and try again";
    case "timeout":
      return "⚠️ Gemini timed out — try again";
    case "network":
      return "⚠️ No connection to Gemini";
    case "parse":
      return "⚠️ Gemini returned an empty response — try again";
    case "api":
      return "⚠️ Gemini error — check the extension and try again";
  }
}

/** Entry point shared by both no-view commands. */
export async function runProofread(formal: boolean): Promise<void> {
  const label = formal ? "Proofread Formal" : "Proofread";
  try {
    const { text, fromSelection } = await readInput();
    if (text === "") {
      await showHUD(
        "⚠️ Nothing to proofread — select some text or copy it first",
      );
      return;
    }

    await showHUD(`${label}…`);
    const { text: corrected } = await proofread(text, resolveOptions(formal));

    if (fromSelection) {
      // Replace the selection in place.
      await Clipboard.paste(corrected);
      await showHUD("✅ Proofread — pasted in place");
    } else {
      // Nothing was selected: leave the corrected text on the clipboard to paste.
      await Clipboard.copy(corrected);
      await showHUD("✅ Proofread — copied to clipboard");
    }
  } catch (raw) {
    await showHUD(hudForError(asProofreadError(raw)));
  }
}
