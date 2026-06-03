/**
 * Безопасный разбор JSON-ответа модели с фолбэком.
 *
 * Модель просят вернуть строго {"translation": string, "explanation": string|null}
 * без преамбулы и ```-обёрток. Но модели иногда своевольничают, поэтому:
 *   1) срезаем код-фенсы;
 *   2) пробуем JSON.parse;
 *   3) пробуем вырезать первый сбалансированный {...};
 *   4) фолбэк: весь текст = translation, explanation = null (§3, требование ТЗ).
 */

import type { TranslateResult } from "../providers/types";

function stripCodeFences(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}

/** Вырезает первый сбалансированный по фигурным скобкам блок (учёт строк/экранирования). */
function extractFirstObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) {
    return null;
  }
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return null;
}

function coerce(parsed: unknown): TranslateResult | null {
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.translation !== "string" || obj.translation.trim() === "") {
    return null;
  }
  const explanation =
    typeof obj.explanation === "string" && obj.explanation.trim() !== ""
      ? obj.explanation.trim()
      : null;
  return { translation: obj.translation.trim(), explanation };
}

function tryParse(candidate: string): TranslateResult | null {
  try {
    return coerce(JSON.parse(candidate));
  } catch {
    return null;
  }
}

export function parseModelOutput(raw: string): TranslateResult {
  const text = (raw ?? "").trim();

  const cleaned = stripCodeFences(text);
  const direct = tryParse(cleaned);
  if (direct) {
    return direct;
  }

  const extracted = extractFirstObject(cleaned);
  if (extracted) {
    const fromExtract = tryParse(extracted);
    if (fromExtract) {
      return fromExtract;
    }
  }

  // Фолбэк: модель проигнорировала формат — не падаем, показываем сырой текст.
  return { translation: text, explanation: null };
}
