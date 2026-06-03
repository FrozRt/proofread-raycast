/**
 * Общий POST-JSON с таймаутом и маппингом ошибок. `label` — имя сервиса для
 * текста ошибок (например "Gemini").
 */

import { TranslateError, errorFromStatus } from "./errors";

export interface PostJsonArgs {
  url: string;
  headers: Record<string, string>;
  body: unknown;
  /** Имя сервиса для сообщений об ошибках. */
  label: string;
  /** Внешняя отмена (например размонтирование компонента). */
  signal?: AbortSignal;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/** Возвращает разобранный JSON-envelope ответа (формат envelope парсит вызывающий). */
export async function postJson(args: PostJsonArgs): Promise<unknown> {
  const {
    url,
    headers,
    body,
    label,
    signal,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = args;

  const timeoutController = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    timeoutController.abort();
  }, timeoutMs);

  const combinedSignal = signal
    ? AbortSignal.any([signal, timeoutController.signal])
    : timeoutController.signal;

  try {
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
        signal: combinedSignal,
      });
    } catch (cause) {
      if (timedOut) {
        throw new TranslateError(
          "timeout",
          `Таймаут запроса к ${label} (${timeoutMs} мс).`,
          { cause },
        );
      }
      if (signal?.aborted) {
        throw cause; // внешняя отмена — пробрасываем как есть, UI это проигнорирует
      }
      throw new TranslateError(
        "network",
        `Не удалось соединиться с ${label}. Проверь сеть.`,
        { cause },
      );
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw errorFromStatus(label, response.status, text);
    }

    try {
      return await response.json();
    } catch (cause) {
      throw new TranslateError(
        "parse",
        `${label} вернул не-JSON тело ответа.`,
        { cause },
      );
    }
  } finally {
    clearTimeout(timer);
  }
}
