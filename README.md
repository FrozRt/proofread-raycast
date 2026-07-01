# Proofread — a multilingual proofreader for Raycast

Proofread **English, Russian, or Spanish** text without leaving your keyboard. The language is
**detected automatically** and the text is **never translated** — it stays in its own language,
with only the mistakes fixed.

It works **in place**: select text in any app, press the hotkey, and the corrected text is
pasted right back over your selection — no window, no form. (If nothing is selected, it reads
the clipboard and leaves the corrected text there for you to paste.)

Two commands, so each can get its own Raycast hotkey:

- **Proofread** — fixes grammar, spelling, and punctuation while keeping your exact wording,
  tone, and level of formality. It will **not** capitalize a lowercase sentence start you wrote
  on purpose, and it will **not** add a trailing period you didn't write.
- **Proofread Formal** — does all of the above and additionally rewrites the text into a
  polished, formal register (e.g. `hi` → `hello`, `gonna` → `going to`).

Runs on **Google Gemini** (free tier — the key is free, see below).

## Features

- **Auto-detected language.** The model detects English / Russian / Spanish and proofreads in
  that same language. It never translates.
- **Style-preserving by default.** Lowercase sentence starts and missing final periods are kept
  as written; casual words are not "upgraded" in the default command.
- **A dedicated formal command.** When you want it polished, use **Proofread Formal**.
- **Term protection.** Proper nouns, brands, code, identifiers, URLs, version numbers, and CLI
  commands (`push`, `merge`, `main`, `CI`, …) are **kept verbatim**.
- **In-place, no window.** Both commands are `no-view`: on the hotkey they proofread your
  selection and paste it back, showing only a small HUD — nothing to click.

## Requirements

- **Raycast** (macOS; the extension also declares Windows support).
- **Node.js ≥ 22.22.2** for building (`@raycast/api` 1.104 asks for it in `engines`).
- **A free Gemini API key** — see below.

## Free Gemini key

Gemini has a free tier, but the API is **key-based** — there is no anonymous access. The key is
free: [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) → **Create API
key** (a Google account is required). Copy the generated key (it may start with `AIza…` or
`AQ.…`). The key is stored in Raycast's secure preference storage — no `.env`, no hardcoding.

If the key is empty or invalid, the command shows a clear message with **Get a Free Key (AI
Studio)** and **Open Extension Preferences** actions.

## Preferences

| Setting | Type | Default | Purpose |
|---|---|---|---|
| **Gemini API Key** | password | — | Free key — [aistudio.google.com](https://aistudio.google.com/app/apikey). |
| **Gemini Model** | text | `gemini-2.5-flash` | Gemini model ID. |

### Free-tier Gemini models

The **Gemini Model** preference is just a string ID, so you can switch models without touching
code. These are available on Gemini's free tier and are the sensible choices for proofreading:

| Model ID | Notes for proofreading |
|---|---|
| `gemini-2.5-flash` | **Default.** Best quality on the free tier; fast enough for everyday use. |
| `gemini-2.5-flash-lite` | **Fastest.** Smaller and quicker than `2.5-flash` — more than capable for grammar/spelling/punctuation. Try this if you want the snappiest turnaround. |
| `gemini-2.0-flash` | Previous-generation flash. Still fast and free; slightly older than the 2.5 line. |
| `gemini-2.0-flash-lite` | Previous-generation lite variant — the leanest 2.0 option. |

Newer model IDs work the same way — just paste the ID into the preference. Because proofreading
is a mechanical task, the extension also disables the model's internal "thinking" step
(`thinkingBudget: 0`), which roughly halves latency with no quality loss; a `-lite` model on top
of that is the fastest configuration.

> Free-tier quotas and the exact model line-up change over time — see
> [ai.google.dev/gemini-api/docs/models](https://ai.google.dev/gemini-api/docs/models) and
> [the rate-limit page](https://ai.google.dev/gemini-api/docs/rate-limits) for the current list.

## Install (local dev)

```bash
npm install
npm run dev
```

`npm run dev` builds the extension and registers the **Proofread** and **Proofread Formal**
commands in your running Raycast (with hot reload). Assign a global hotkey to each:
Raycast → Extensions → **Proofread** → *Record Hotkey* (one per command).

## Publishing to the Raycast Store

The extension is set up to meet the [Store requirements](https://developers.raycast.com/basics/prepare-an-extension-for-store):
Title Case name, single-sentence description, `MIT` license, a category, `platforms`, a 512×512
icon, this README, and a `CHANGELOG.md`.

```bash
npm run build      # validates the extension for distribution
npm run lint       # ESLint + Prettier + manifest validation
npm run publish    # opens a PR against raycast/extensions
```

> The **`author`** field in `package.json` is set to `mikhail_chigrin`. If you publish under a
> different Raycast account, update it (Raycast → Settings → Account). You may also add up to six
> 2000×1250 screenshots under a top-level `metadata/` folder.

## Testing the logic without the UI (eval harness)

The proofreading logic (the main risk) is validated **headless**, bypassing the Raycast modal —
the core `proofread()` is called directly, with the key from an env var:

```bash
# all cases (default, style-preserving mode)
GEMINI_API_KEY=... npm run eval

# formal mode / a specific case / a different model
GEMINI_API_KEY=... npm run eval -- --formal
GEMINI_API_KEY=... npm run eval -- --case 2
GEMINI_API_KEY=... npm run eval -- --model gemini-2.5-flash-lite

npm run eval -- --list      # list the cases
npm run eval -- --case 8    # "empty key" — works without a key
npm run eval -- --help      # all flags
```

Cases 2 / 4 / 7 / 8 are auto-checked (register kept / no added period / terms kept / auth
error); the rest are printed for eyeballing. Env key: `GEMINI_API_KEY`.

## Architecture

```
src/
  proofread.tsx        # no-view command entry — Proofread (formal: false)
  proofread-formal.tsx # no-view command entry — Proofread Formal (formal: true)
  run-proofread.ts     # the Raycast glue: read selection/clipboard → proofread → paste + HUD
  prompt.ts            # system prompt: the two modes + term protection + strict output
  providers/
    index.ts           # proofread() entry point + default model
    types.ts           # ProofreadOptions / ProofreadResult
    gemini.ts          # Gemini generateContent (key in header)
  lib/
    http.ts            # postJson: timeout (AbortController) + status mapping
    parse.ts           # strips code fences / wrapping quotes from the model output
    errors.ts          # ProofreadError discriminated by kind
scripts/
  eval.ts              # headless test-case runner
```

The key point: the **core (`prompt`/`providers`/`lib`) does not depend on `@raycast/api`** —
the provider receives `apiKey`/`model`/`formal` as explicit arguments (DI). The same
`proofread()` runs in both the no-view commands and the eval harness. The corrected text comes back as plain
text; parsing defensively strips stray ``` fences or wrapping quotes. No streaming — one
request, wait for the full response. The `gemini.ts` layer is kept as a seam: re-adding other
providers means restoring their modules from git history and adding a dispatcher.

## Security notes

- The API key travels only in the `x-goog-api-key` request header — never in the URL, logs, or
  the UI, and it is never committed.
- Model output is never rendered as markdown or HTML — it is only pasted/copied as plain text —
  so crafted output can't auto-load a remote image or execute anything.
- The `<input>…</input>` delimiter limits prompt injection; impact is bounded since the only
  actor is the user proofreading their own text.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | dev mode with hot reload, registers the commands in Raycast |
| `npm run build` | production build / distribution validation (`ray build`) |
| `npm run lint` | `ray lint` (ESLint + Prettier + manifest validation) |
| `npm run fix-lint` | auto-fix lint/formatting |
| `npm run publish` | open a Store PR against `raycast/extensions` |
| `npm run eval` | headless run of the test cases (Gemini) |

## Credits

This extension began as a fork of the **Polyglot** RU⇄EN translator by Makar Mishchenko, and
was reworked into a multilingual proofreader. The original code is used under its MIT license.

## License

[MIT](LICENSE). Copyright © 2026 Makar Mishchenko and Mikhail Chigrin.
