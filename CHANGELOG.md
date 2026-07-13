# Proofread Changelog

## [Initial Version] - {PR_MERGE_DATE}

- Proofread English, Russian, or Spanish text; the language is detected automatically and the text is never translated.
- **Proofread** command: fixes grammar, spelling, and punctuation while preserving the author's wording, tone, and level of formality (never capitalizes a lowercase sentence start or adds a trailing period the author did not write).
- **Proofread Formal** command: additionally rewrites the text into a polished, formal register.
- Technical terms and identifiers (code, URLs, CLI commands, product names) are kept verbatim.
- Works in place: both commands are `no-view` — on the hotkey they proofread the selected text and paste it back over the selection (or, if nothing is selected, read the clipboard and leave the result there), with only a HUD for feedback.
- **Paste Mode** preference: paste as plain match-style (Shift+Cmd+V, default — avoids extra blank lines in Microsoft Teams / Slack), normal (Cmd+V), or copy-only.
- Powered by Google Gemini via a free API key.
