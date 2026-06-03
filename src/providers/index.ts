/**
 * Точка входа ядра: `translate()`. Валидирует ввод/ключ и делегирует Gemini —
 * единственному провайдеру приложения. Слой gemini.ts оставлен как граница:
 * вернуть других провайдеров = достать их модули из git-истории + диспетчер.
 */

import { TranslateError } from "../lib/errors";
import { translateWithGemini } from "./gemini";
import type { TranslateOptions, TranslateResult } from "./types";

/** Дефолтная модель Gemini — фолбэк, если поле в настройках пустое. */
export const DEFAULT_MODEL = "gemini-2.5-flash";

export async function translate(
  input: string,
  opts: TranslateOptions,
): Promise<TranslateResult> {
  const text = input.trim();
  if (text === "") {
    throw new TranslateError("empty", "Пустой ввод — нечего переводить.");
  }
  if (opts.apiKey.trim() === "") {
    throw new TranslateError(
      "auth",
      "Не задан Gemini API-ключ. Он бесплатный: получи на aistudio.google.com (Get API key).",
    );
  }

  return translateWithGemini(text, opts);
}

export type { TranslateOptions, TranslateResult } from "./types";
