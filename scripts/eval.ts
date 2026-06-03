/**
 * Headless-прогон тест-кейсов §8 в обход UI Raycast (только Gemini).
 *
 * Валидирует ЛОГИКУ промпта (главный риск) напрямую через ядро `translate()`,
 * без модалки Raycast и без preferences. Ключ берётся из env GEMINI_API_KEY.
 *
 * Запуск:
 *   GEMINI_API_KEY=...  npm run eval                 # все кейсы
 *   GEMINI_API_KEY=...  npm run eval -- --case 1     # один кейс
 *   GEMINI_API_KEY=...  npm run eval -- --lang English
 *   npm run eval -- --list                           # список кейсов
 *   npm run eval -- --case 8                          # «пустой ключ» — работает без ключа
 *
 * Флаги: --case <N>  --lang <Language>  --model <id>  --always  --list  --help
 */

import { DEFAULT_MODEL, translate } from "../src/providers";
import type { TranslateOptions, TranslateResult } from "../src/providers/types";
import { asTranslateError } from "../src/lib/errors";

const ENV_KEY = "GEMINI_API_KEY";

// --- крошечный ANSI-хелпер ---------------------------------------------------
const useColor = process.stdout.isTTY;
const paint = (code: string, s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = (s: string) => paint("1", s);
const dim = (s: string) => paint("2", s);
const green = (s: string) => paint("32", s);
const red = (s: string) => paint("31", s);
const yellow = (s: string) => paint("33", s);
const cyan = (s: string) => paint("36", s);

// --- разбор аргументов -------------------------------------------------------
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
        console.error(yellow(`Неизвестный флаг: ${a}`));
    }
  }
  return args;
}

// --- кейсы §8 ----------------------------------------------------------------
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
    title: "Англ. слово «set» — многозначность",
    input: "set",
    expect: "Перевод на RU + ПОЛНЫЙ блок: несколько значений, примеры в разных контекстах.",
  },
  {
    n: 2,
    title: "Рус. слово «замок» — омонимы",
    input: "замок",
    expect: "Перевод на EN + блок разводит castle / lock, примеры.",
  },
  {
    n: 3,
    title: "Англ. идиома «break a leg»",
    input: "break a leg",
    expect: "Перевод + блок: буквальное vs идиоматическое значение.",
  },
  {
    n: 4,
    title: "Простое предложение без подвохов",
    input: "I will call you tomorrow",
    expect: "Перевод на RU, блок ОТСУТСТВУЕТ (explanation === null).",
    check: (r) => ({
      ok: r.explanation === null,
      note: r.explanation === null ? "блок отсутствует" : "блок есть, а не должно быть",
    }),
  },
  {
    n: 5,
    title: "Рус. многозначность «Он снял банк»",
    input: "Он снял банк",
    expect: "Перевод на EN + блок поясняет неоднозначность (снял = выиграл банк / снял деньги / арендовал).",
  },
  {
    n: 6,
    title: "Смешанный текст + термины",
    input: "Запушь изменения в main и проверь CI",
    expect: "Перевод на EN; push / main / CI сохранены, не переведены криво.",
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
    title: "Технический термин «retopology»",
    input: "retopology",
    expect: "Перевод/транслитерация + пояснение (термин 3D).",
  },
  {
    n: 8,
    title: "Пустой Gemini-ключ",
    input: "test",
    expect: "Ядро бросает TranslateError kind=auth (UI ведёт в настройки). Работает без ключа.",
    special: "emptyKey",
    check: () => ({ ok: true, note: "" }),
  },
  {
    n: 9,
    title: "Длинный абзац без подводных камней",
    input:
      "Вчера я весь день работал из дома. Утром ответил на письма, потом созвонился с командой и обсудил план на неделю. После обеда написал отчёт и отправил его руководителю, а вечером немного погулял и лёг спать пораньше.",
    expect: "Перевод на EN; блок краткий или отсутствует.",
  },
  {
    n: 10,
    title: "Смена языка блока (explanationLanguage)",
    input: "set",
    expect: "Тот же ввод, что и кейс 1, но блок выходит на другом языке (флип от текущего).",
    special: "langFlip",
  },
];

// --- печать ------------------------------------------------------------------
function printResult(r: TranslateResult) {
  console.log(bold("Перевод: ") + r.translation);
  if (r.explanation) {
    console.log(bold("Блок:"));
    console.log(
      r.explanation
        .split("\n")
        .map((l) => "  " + l)
        .join("\n"),
    );
  } else {
    console.log(bold("Блок: ") + dim("[нет блока]"));
  }
}

function verdict(ok: boolean, note: string) {
  console.log((ok ? green("АВТО-ПРОВЕРКА: PASS") : red("АВТО-ПРОВЕРКА: FAIL")) + (note ? dim(` — ${note}`) : ""));
}

function flipLang(lang: string): string {
  return lang.trim().toLowerCase() === "russian" ? "English" : "Russian";
}

async function runCase(c: EvalCase, base: TranslateOptions, hasKey: boolean) {
  console.log("");
  console.log(cyan("─".repeat(70)));
  console.log(cyan(`КЕЙС ${c.n}. `) + bold(c.title));
  console.log(dim("Ввод:     ") + JSON.stringify(c.input));
  console.log(dim("Ожидание: ") + c.expect);

  // Кейс «пустой ключ» — не требует реального ключа.
  if (c.special === "emptyKey") {
    try {
      await translate(c.input, { ...base, apiKey: "" });
      verdict(false, "ожидали ошибку auth, но запрос прошёл");
    } catch (e) {
      const err = asTranslateError(e);
      verdict(err.kind === "auth", `kind=${err.kind}: ${err.message}`);
    }
    return;
  }

  if (!hasKey) {
    console.log(yellow(`SKIP: нет ключа в env (${ENV_KEY}) — живой запрос пропущен.`));
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
    console.log(dim(`(${ms} мс)`));
    if (c.check) {
      const v = c.check(r);
      verdict(v.ok, v.note);
    }
  } catch (e) {
    const err = asTranslateError(e);
    console.log(red(`ОШИБКА: kind=${err.kind} — ${err.message}`));
  }
}

function printHelp() {
  console.log(`Polyglot eval — прогон тест-кейсов §8 без UI Raycast (только Gemini).

Флаги:
  --case <N>            один кейс (1..10)
  --lang <Language>     язык блока (дефолт: Russian)
  --model <id>          переопределить модель Gemini
  --always              alwaysExplain = true
  --list                список кейсов
  --help                эта справка

Ключ через env: ${ENV_KEY}
Пример: ${ENV_KEY}=xxx npm run eval -- --case 1`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }
  if (args.list) {
    console.log(bold("Кейсы §8:"));
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
  console.log(dim("Модель:       ") + base.model);
  console.log(dim("Язык блока:   ") + base.explanationLanguage);
  console.log(dim("alwaysExplain:") + ` ${base.alwaysExplain}`);
  console.log(dim("Ключ:         ") + (hasKey ? green("задан") : red(`нет (${ENV_KEY})`)));
  if (!hasKey) {
    console.log(yellow("Без ключа выполнится только кейс 8 (пустой ключ); остальные — SKIP."));
  }

  const selected = args.caseNo ? CASES.filter((c) => c.n === args.caseNo) : CASES;
  if (selected.length === 0) {
    console.error(red(`Кейс ${args.caseNo} не найден (доступно 1..${CASES.length}).`));
    process.exit(1);
  }

  for (const c of selected) {
    await runCase(c, base, hasKey);
  }
  console.log("");
  console.log(cyan("─".repeat(70)));
  console.log(green("Готово."));
}

void main();
