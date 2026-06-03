/**
 * Headless run of the §8 test cases, bypassing the Raycast UI (Gemini only).
 *
 * Validates the prompt LOGIC (the main risk) directly through the core
 * `translate()`, without the Raycast modal and without preferences. The key
 * comes from the GEMINI_API_KEY env var.
 *
 * Usage:
 *   GEMINI_API_KEY=...  npm run eval                 # all cases
 *   GEMINI_API_KEY=...  npm run eval -- --case 1     # one case
 *   GEMINI_API_KEY=...  npm run eval -- --lang English
 *   npm run eval -- --list                           # list the cases
 *   npm run eval -- --case 8                          # "no key" — works without a key
 *
 * Flags: --case <N>  --lang <Language>  --model <id>  --always  --list  --help
 */

import { DEFAULT_MODEL, translate } from "../src/providers";
import type { TranslateOptions, TranslateResult } from "../src/providers/types";
import { asTranslateError } from "../src/lib/errors";

const ENV_KEY = "GEMINI_API_KEY";

// --- tiny ANSI helper --------------------------------------------------------
const useColor = process.stdout.isTTY;
const paint = (code: string, s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = (s: string) => paint("1", s);
const dim = (s: string) => paint("2", s);
const green = (s: string) => paint("32", s);
const red = (s: string) => paint("31", s);
const yellow = (s: string) => paint("33", s);
const cyan = (s: string) => paint("36", s);

// --- argument parsing --------------------------------------------------------
interface Args {
  caseNo?: number;
  lang?: string;
  model?: string;
  always: boolean;
  list: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { always: false, list: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const valueOf = (inline?: string) => inline ?? argv[++i];
    const [flag, inline] = a.includes("=") ? [a.slice(0, a.indexOf("=")), a.slice(a.indexOf("=") + 1)] : [a, undefined];
    switch (flag) {
      case "--case":
        args.caseNo = Number(valueOf(inline));
        break;
      case "--lang":
        args.lang = valueOf(inline);
        break;
      case "--model":
        args.model = valueOf(inline);
        break;
      case "--always":
        args.always = true;
        break;
      case "--list":
        args.list = true;
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      default:
        console.error(yellow(`Unknown flag: ${a}`));
    }
  }
  return args;
}

// --- §8 cases ----------------------------------------------------------------
type Special = "emptyKey" | "langFlip";
interface EvalCase {
  n: number;
  title: string;
  input: string;
  expect: string;
  special?: Special;
  check?: (r: TranslateResult) => { ok: boolean; note: string };
}

const CASES: EvalCase[] = [
  {
    n: 1,
    title: "EN word «set» — polysemy",
    input: "set",
    expect: "RU translation + FULL block: several meanings, examples across different contexts.",
  },
  {
    n: 2,
    title: "RU word «замок» — homonyms",
    input: "замок",
    expect: "EN translation + block separating castle / lock, with examples.",
  },
  {
    n: 3,
    title: "EN idiom «break a leg»",
    input: "break a leg",
    expect: "Translation + block: literal vs idiomatic meaning.",
  },
  {
    n: 4,
    title: "Plain sentence, no pitfalls",
    input: "I will call you tomorrow",
    expect: "RU translation, block ABSENT (explanation === null).",
    check: (r) => ({
      ok: r.explanation === null,
      note: r.explanation === null ? "block absent" : "block present but should not be",
    }),
  },
  {
    n: 5,
    title: "RU ambiguity «Он снял банк»",
    input: "Он снял банк",
    expect: "EN translation + block flags the ambiguity (won the pot / withdrew money / rented the bank).",
  },
  {
    n: 6,
    title: "Mixed text + terms",
    input: "Запушь изменения в main и проверь CI",
    expect: "EN translation; push / main / CI kept verbatim, not mistranslated.",
    check: (r) => {
      const t = r.translation;
      const keptMain = /\bmain\b/.test(t);
      const keptCI = /\bCI\b/.test(t);
      const keptPush = /push/i.test(t);
      const ok = keptMain && keptCI && keptPush;
      return { ok, note: `main:${keptMain ? "✓" : "✗"} CI:${keptCI ? "✓" : "✗"} push:${keptPush ? "✓" : "✗"}` };
    },
  },
  {
    n: 7,
    title: "Technical term «retopology»",
    input: "retopology",
    expect: "Translation/transliteration + explanation (3D term).",
  },
  {
    n: 8,
    title: "Empty Gemini key",
    input: "test",
    expect: "Core throws TranslateError kind=auth (UI leads to preferences). Works without a key.",
    special: "emptyKey",
    check: () => ({ ok: true, note: "" }),
  },
  {
    n: 9,
    title: "Long paragraph, no pitfalls",
    input:
      "Вчера я весь день работал из дома. Утром ответил на письма, потом созвонился с командой и обсудил план на неделю. После обеда написал отчёт и отправил его руководителю, а вечером немного погулял и лёг спать пораньше.",
    expect: "EN translation; block short or absent.",
  },
  {
    n: 10,
    title: "Block language switch (explanationLanguage)",
    input: "set",
    expect: "Same input as case 1, but the block comes out in a different language (flipped from current).",
    special: "langFlip",
  },
];

// --- printing ----------------------------------------------------------------
function printResult(r: TranslateResult) {
  console.log(bold("Translation: ") + r.translation);
  if (r.explanation) {
    console.log(bold("Block:"));
    console.log(
      r.explanation
        .split("\n")
        .map((l) => "  " + l)
        .join("\n"),
    );
  } else {
    console.log(bold("Block: ") + dim("[no block]"));
  }
}

function verdict(ok: boolean, note: string) {
  console.log((ok ? green("AUTO-CHECK: PASS") : red("AUTO-CHECK: FAIL")) + (note ? dim(` — ${note}`) : ""));
}

function flipLang(lang: string): string {
  return lang.trim().toLowerCase() === "russian" ? "English" : "Russian";
}

async function runCase(c: EvalCase, base: TranslateOptions, hasKey: boolean) {
  console.log("");
  console.log(cyan("─".repeat(70)));
  console.log(cyan(`CASE ${c.n}. `) + bold(c.title));
  console.log(dim("Input:    ") + JSON.stringify(c.input));
  console.log(dim("Expected: ") + c.expect);

  // The "empty key" case does not need a real key.
  if (c.special === "emptyKey") {
    try {
      await translate(c.input, { ...base, apiKey: "" });
      verdict(false, "expected an auth error, but the request went through");
    } catch (e) {
      const err = asTranslateError(e);
      verdict(err.kind === "auth", `kind=${err.kind}: ${err.message}`);
    }
    return;
  }

  if (!hasKey) {
    console.log(yellow(`SKIP: no key in env (${ENV_KEY}) — live request skipped.`));
    return;
  }

  const opts: TranslateOptions =
    c.special === "langFlip" ? { ...base, explanationLanguage: flipLang(base.explanationLanguage) } : base;
  if (c.special === "langFlip") {
    console.log(dim(`(explanationLanguage: ${base.explanationLanguage} → ${opts.explanationLanguage})`));
  }

  try {
    const started = Date.now();
    const r = await translate(c.input, opts);
    const ms = Date.now() - started;
    printResult(r);
    console.log(dim(`(${ms} ms)`));
    if (c.check) {
      const v = c.check(r);
      verdict(v.ok, v.note);
    }
  } catch (e) {
    const err = asTranslateError(e);
    console.log(red(`ERROR: kind=${err.kind} — ${err.message}`));
  }
}

function printHelp() {
  console.log(`Polyglot eval — run the §8 test cases without the Raycast UI (Gemini only).

Flags:
  --case <N>            a single case (1..10)
  --lang <Language>     block language (default: Russian)
  --model <id>          override the Gemini model
  --always              alwaysExplain = true
  --list                list the cases
  --help                this help

Key via env: ${ENV_KEY}
Example: ${ENV_KEY}=xxx npm run eval -- --case 1`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }
  if (args.list) {
    console.log(bold("§8 cases:"));
    for (const c of CASES) {
      console.log(`  ${String(c.n).padStart(2)}. ${c.title}`);
    }
    return;
  }

  const apiKey = (process.env[ENV_KEY] ?? "").trim();
  const hasKey = apiKey !== "";
  const base: TranslateOptions = {
    apiKey,
    model: args.model ?? DEFAULT_MODEL,
    explanationLanguage: args.lang ?? process.env.POLYGLOT_EXPLANATION_LANGUAGE ?? "Russian",
    alwaysExplain: args.always,
  };

  console.log(bold("Polyglot eval — Gemini"));
  console.log(dim("Model:        ") + base.model);
  console.log(dim("Block lang:   ") + base.explanationLanguage);
  console.log(dim("alwaysExplain:") + ` ${base.alwaysExplain}`);
  console.log(dim("Key:          ") + (hasKey ? green("set") : red(`missing (${ENV_KEY})`)));
  if (!hasKey) {
    console.log(yellow("Without a key only case 8 (empty key) runs; the rest are SKIP."));
  }

  const selected = args.caseNo ? CASES.filter((c) => c.n === args.caseNo) : CASES;
  if (selected.length === 0) {
    console.error(red(`Case ${args.caseNo} not found (available 1..${CASES.length}).`));
    process.exit(1);
  }

  for (const c of selected) {
    await runCase(c, base, hasKey);
  }
  console.log("");
  console.log(cyan("─".repeat(70)));
  console.log(green("Done."));
}

void main();
