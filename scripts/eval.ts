/**
 * Headless run of the proofreading test cases, bypassing the Raycast UI (Gemini only).
 *
 * Validates the prompt LOGIC (the main risk) directly through the core
 * `proofread()`, without the Raycast modal and without preferences. The key
 * comes from the GEMINI_API_KEY env var.
 *
 * Usage:
 *   GEMINI_API_KEY=...  npm run eval                 # all cases
 *   GEMINI_API_KEY=...  npm run eval -- --case 1     # one case
 *   GEMINI_API_KEY=...  npm run eval -- --formal     # force formal mode
 *   npm run eval -- --list                           # list the cases
 *   npm run eval -- --case 8                          # "no key" — works without a key
 *
 * Flags: --case <N>  --model <id>  --formal  --list  --help
 */

import { DEFAULT_MODEL, proofread } from "../src/providers";
import type { ProofreadOptions, ProofreadResult } from "../src/providers/types";
import { asProofreadError } from "../src/lib/errors";

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
  model?: string;
  formal: boolean;
  list: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { formal: false, list: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const valueOf = (inline?: string) => inline ?? argv[++i];
    const [flag, inline] = a.includes("=") ? [a.slice(0, a.indexOf("=")), a.slice(a.indexOf("=") + 1)] : [a, undefined];
    switch (flag) {
      case "--case":
        args.caseNo = Number(valueOf(inline));
        break;
      case "--model":
        args.model = valueOf(inline);
        break;
      case "--formal":
        args.formal = true;
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

// --- cases -------------------------------------------------------------------
type Special = "emptyKey";
interface EvalCase {
  n: number;
  title: string;
  input: string;
  expect: string;
  special?: Special;
  /** When set, the case is only meaningful in this mode. */
  onlyFormal?: boolean;
  check?: (r: ProofreadResult) => { ok: boolean; note: string };
}

const CASES: EvalCase[] = [
  {
    n: 1,
    title: "EN — basic grammar/spelling fix",
    input: "she dont has no time for this tasks",
    expect: "Grammar/spelling corrected, same meaning, same casual tone.",
  },
  {
    n: 2,
    title: "EN — keep informal register (default mode)",
    input: "hey, can u send me teh file wen your free?",
    expect: 'Fix spelling (u/teh/wen/your), but keep "hey"/"u"→"you" casual; do NOT formalize to "Hello".',
    check: (r) => {
      const formalized = /^hello\b/i.test(r.text.trim());
      return { ok: !formalized, note: formalized ? 'formalized "hey"→"Hello" (should not)' : "kept casual greeting" };
    },
  },
  {
    n: 3,
    title: "EN — do not capitalize lowercase sentence start",
    input: "i went to the store. i bought milk",
    expect: 'Leading "i" → "I" (pronoun), but sentence-initial lowercase words that are not "i" stay lowercase; no forced capitalization of the first word.',
  },
  {
    n: 4,
    title: "EN — no trailing period added to final sentence",
    input: "thanks for the update",
    expect: "Single sentence with no trailing period → stays without a trailing period.",
    check: (r) => {
      const ok = !r.text.trim().endsWith(".");
      return { ok, note: ok ? "no trailing period" : "added a trailing period (should not)" };
    },
  },
  {
    n: 5,
    title: "RU — grammar/punctuation fix",
    input: "я хочу пойти в магазин но у меня нет времени",
    expect: "Comma before «но»; stays Russian; not translated; casual tone kept.",
  },
  {
    n: 6,
    title: "ES — grammar/accents fix",
    input: "el no sabe donde esta la biblioteca",
    expect: "Accents/grammar fixed (él, dónde, está); stays Spanish; not translated.",
  },
  {
    n: 7,
    title: "Keep technical terms verbatim",
    input: "please push you're changes to main and check teh CI",
    expect: 'Fix "you\'re"→"your", "teh"→"the"; keep push / main / CI verbatim.',
    check: (r) => {
      const t = r.text;
      const keptMain = /\bmain\b/.test(t);
      const keptCI = /\bCI\b/.test(t);
      const keptPush = /push/i.test(t);
      const ok = keptMain && keptCI && keptPush;
      return { ok, note: `main:${keptMain ? "✓" : "✗"} CI:${keptCI ? "✓" : "✗"} push:${keptPush ? "✓" : "✗"}` };
    },
  },
  {
    n: 8,
    title: "Empty Gemini key",
    input: "test",
    expect: "Core throws ProofreadError kind=auth (UI leads to preferences). Works without a key.",
    special: "emptyKey",
    check: () => ({ ok: true, note: "" }),
  },
  {
    n: 9,
    title: "FORMAL — raise casual to formal register",
    input: "hey, gonna be a bit late, sry",
    expect: 'In formal mode: rewritten formally (e.g. "Hello", "going to", "apologies"). Only meaningful with --formal.',
    onlyFormal: true,
  },
  {
    n: 10,
    title: "Already-correct text is left unchanged",
    input: "The meeting is scheduled for Monday at 9 a.m.",
    expect: "Correct input returned essentially unchanged.",
  },
];

// --- printing ----------------------------------------------------------------
function printResult(r: ProofreadResult) {
  console.log(bold("Corrected: ") + r.text);
}

function verdict(ok: boolean, note: string) {
  console.log((ok ? green("AUTO-CHECK: PASS") : red("AUTO-CHECK: FAIL")) + (note ? dim(` — ${note}`) : ""));
}

async function runCase(c: EvalCase, base: ProofreadOptions, hasKey: boolean) {
  console.log("");
  console.log(cyan("─".repeat(70)));
  console.log(cyan(`CASE ${c.n}. `) + bold(c.title));
  console.log(dim("Input:    ") + JSON.stringify(c.input));
  console.log(dim("Expected: ") + c.expect);

  // The "empty key" case does not need a real key.
  if (c.special === "emptyKey") {
    try {
      await proofread(c.input, { ...base, apiKey: "" });
      verdict(false, "expected an auth error, but the request went through");
    } catch (e) {
      const err = asProofreadError(e);
      verdict(err.kind === "auth", `kind=${err.kind}: ${err.message}`);
    }
    return;
  }

  if (c.onlyFormal && !base.formal) {
    console.log(yellow("SKIP: only meaningful with --formal."));
    return;
  }

  if (!hasKey) {
    console.log(yellow(`SKIP: no key in env (${ENV_KEY}) — live request skipped.`));
    return;
  }

  try {
    const started = Date.now();
    const r = await proofread(c.input, base);
    const ms = Date.now() - started;
    printResult(r);
    console.log(dim(`(${ms} ms)`));
    if (c.check) {
      const v = c.check(r);
      verdict(v.ok, v.note);
    }
  } catch (e) {
    const err = asProofreadError(e);
    console.log(red(`ERROR: kind=${err.kind} — ${err.message}`));
  }
}

function printHelp() {
  console.log(`Proofread eval — run the test cases without the Raycast UI (Gemini only).

Flags:
  --case <N>            a single case (1..10)
  --model <id>          override the Gemini model
  --formal              use the formal proofreading mode
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
    console.log(bold("Cases:"));
    for (const c of CASES) {
      console.log(`  ${String(c.n).padStart(2)}. ${c.title}`);
    }
    return;
  }

  const apiKey = (process.env[ENV_KEY] ?? "").trim();
  const hasKey = apiKey !== "";
  const base: ProofreadOptions = {
    apiKey,
    model: args.model ?? DEFAULT_MODEL,
    formal: args.formal,
  };

  console.log(bold("Proofread eval — Gemini"));
  console.log(dim("Model:  ") + base.model);
  console.log(dim("Mode:   ") + (base.formal ? "formal" : "keep register"));
  console.log(dim("Key:    ") + (hasKey ? green("set") : red(`missing (${ENV_KEY})`)));
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
