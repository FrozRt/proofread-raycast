# Polyglot — a bilingual translator for Raycast

A RU⇄EN translator that **figures out the direction itself** and, when useful, adds a
learning breakdown. There is no "target language" to pick: type Russian and you get English,
type English and you get Russian. Below the translation, **when it helps**, an explanation
block appears (meanings, idioms, false friends, grammar) — turning a plain translator into a
study tool.

Runs on **Google Gemini** (free tier — the key is free, see below).

> 📸 _Screenshot: drop `metadata/translate.png` here after the first run
> (`npm run dev` → run the command → screenshot the result window)._

## Features

- **Auto-flip RU⇄EN.** The model picks the direction from the dominant language of the input.
- **Term protection.** Proper nouns, brands, dev-stack names (React Native, TypeScript, MobX,
  API/class/hook names), code, identifiers and URLs are **kept verbatim**.
- **Dictionary mode.** A single word yields a full entry: meanings, transcription, forms, examples.
- **Conditional explanation block.** Plain, unambiguous sentences get no block (no noise);
  polysemous words, idioms, phrasal verbs, slang, jargon and genuinely ambiguous phrases get
  one that explains exactly the tricky spots (see [below](#the-explanation-block)).

## Requirements

- **Raycast** (macOS).
- **Node.js ≥ 22.22.2.** It also builds on 22.19, but `@raycast/api` 1.104 asks for ≥ 22.22.2
  in `engines` — if `npm run dev` complains, upgrade Node (22.22+ or 24).
- **A free Gemini API key** — see below.

## Free Gemini key

Gemini has a free tier, but the API is **key-based** — there is no anonymous access. The key
is free: [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) → **Create
API key** (a Google account is required). It starts with `AIza…`. The free-tier quota is more
than enough for personal use. The key is stored in Raycast's secure preference storage — no
`.env`, no hardcoding.

## Install (local, not published to the Store)

```bash
git clone https://github.com/MakarUrbanov/polyglot-raycast.git
cd polyglot-raycast
npm install
npm run dev
```

`npm run dev` builds the extension and registers the **Translate** command in your running
Raycast (with hot reload). Find it in Raycast by searching `Translate` or `Polyglot`.

- Assign a global hotkey: Raycast → Extensions → **Polyglot → Translate** → *Record Hotkey*.
- Open the command's preferences (in Raycast: select the command and press `⌘ ,`, or use
  *Open Extension Preferences* / *Get a Free Key* right from the error screen) and paste the key.

When you're done, you can stop `npm run dev` (`Ctrl-C`) — the **extension stays installed** in
Raycast as a local one.

### Local dev extension vs the Store

This is a local extension **for personal use** — it is not published to the Raycast Store. An
extension imported via `npm run dev` lives on your machine, **does not update from the Store**,
and does not depend on it. Stopping the dev server does not remove the command — it keeps
working. That is exactly the mode you want for a personal tool.

## Preferences

All settings are standard Raycast preferences (the key is stored in Raycast's secure storage):

| Setting | Type | Default | Purpose |
|---|---|---|---|
| **Gemini API Key** | password | — | Free key — [aistudio.google.com](https://aistudio.google.com/app/apikey). |
| **Gemini Model** | text | `gemini-2.5-flash` | Gemini model ID. |
| **Explanation Language** | text | `Russian` | Language of the explanation block (any: `English`, `German`, …). |
| **Always Explain** | checkbox | `off` | Force the block even for simple phrases. |

The model is just a string ID, so when a new version ships you change the preference without
touching code. Free-tier models: `gemini-2.5-flash` (default), `gemini-2.5-flash-lite`,
`gemini-3.5-flash` (more capable, but noticeably pricier on the paid tier).

If the key is empty or invalid, the command shows a clear message with **Get a Free Key (AI
Studio)** and **Open Extension Preferences** actions.

## The explanation block

The block is **not always shown** — the model decides:

- **a single word / short idiom (≤ ~3 words)** → always, in full (dictionary mode);
- **a sentence with a polysemous word / idiom / phrasal verb / slang / term / false friend /
  non-obvious register, or genuine ambiguity** → a block explaining exactly those spots;
- **a plain, unambiguous sentence** → no block (translation only);
- **a long text** → a short block only if there's something worth explaining.

Block sections (all optional, empty ones dropped): part of speech & forms · pronunciation ·
meanings · examples in context · nuance/connotation/register · synonyms/antonyms ·
idiom/phrasal verb · grammar note. The whole block is in `Explanation Language`, except the
example words/sentences in the studied languages.

The **Always Explain** checkbox forces a block even on simple phrases.

## Testing the logic without the UI (eval harness)

The translation/block logic (the main risk) is validated **headless**, bypassing the Raycast
modal — the core `translate()` is called directly, with the key from an env var:

```bash
# all 10 test cases
GEMINI_API_KEY=... npm run eval

# a specific case / block language / model
GEMINI_API_KEY=... npm run eval -- --case 1
GEMINI_API_KEY=... npm run eval -- --lang English
GEMINI_API_KEY=... npm run eval -- --model gemini-2.5-flash-lite

npm run eval -- --list      # list the cases
npm run eval -- --case 8    # "empty key" — works without a key
npm run eval -- --help      # all flags
```

Cases 4 / 6 / 8 are auto-checked (block absent / terms kept / auth error); the rest are printed
for eyeballing. Env key: `GEMINI_API_KEY`.

## Architecture

```
src/
  translate.tsx        # the only file that imports @raycast/api: Form → Detail
  prompt.ts            # system prompt: the flip, term protection, block rules
  providers/
    index.ts           # translate() entry point + default model
    types.ts           # TranslateOptions / TranslateResult
    gemini.ts          # Gemini generateContent (responseMimeType json, key in header)
  lib/
    http.ts            # postJson: timeout (AbortController) + status mapping
    parse.ts           # defensive JSON parsing with a fallback
    errors.ts          # TranslateError discriminated by kind
scripts/
  eval.ts              # headless test-case runner
```

The key point: the **core (`prompt`/`providers`/`lib`) does not depend on `@raycast/api`** —
the provider receives `apiKey`/`model` as explicit arguments (DI). The same `translate()` runs
in both the UI and the eval harness. The translation and the block come back in **one request**
as `{ translation, explanation | null }`; parsing is resilient to model misbehavior (strips
``` fences, extracts the first JSON object, falls back to raw text). No streaming — one request,
wait for the full response. The `gemini.ts` layer is kept as a seam: re-adding other providers
means restoring their modules from git history and adding a dispatcher.

## Security notes

- The API key travels only in the `x-goog-api-key` request header — never in the URL, logs, or
  the UI, and it is never committed (`.gitignore` covers generated files; preferences hold it).
- Model output is treated as untrusted: it is rendered as markdown in `Detail`, and image
  syntax (`![](…)`) is defanged so a crafted translation can't auto-load a remote image.
- The `<input>…</input>` delimiter limits prompt injection; impact is bounded since the only
  actor is the user translating their own text.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | dev mode with hot reload, registers the command in Raycast |
| `npm run build` | production build (`ray build`) |
| `npm run lint` | `ray lint` (ESLint + Prettier + manifest validation) |
| `npm run fix-lint` | auto-fix lint/formatting |
| `npm run eval` | headless run of the test cases (Gemini) |

> Note: `npm run lint` flags one rule — the `author` field (`makarurbanov`) is not registered
> in the Raycast user registry. It doesn't affect local use; set your own Raycast username
> (Raycast → Settings → Account) for a clean lint.

## License

[MIT](LICENSE).
