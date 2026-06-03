/**
 * Единая ошибка перевода с дискриминантом `kind`.
 *
 * Один класс с union-полем `kind` вместо иерархии (AuthError/RateLimitError/…):
 * маппинг в UI — это исчерпывающий `switch (error.kind)`, а не цепочка instanceof,
 * и меньше boilerplate.
 */

export type TranslateErrorKind =
  | "empty" // пустой ввод — нечего переводить
  | "auth" // ключ не задан или отклонён (401/403)
  | "rateLimit" // 429
  | "timeout" // сработал AbortController по таймауту
  | "network" // соединение не удалось
  | "parse" // сервис вернул пустой/непарсируемый envelope
  | "api"; // прочий не-2xx ответ

export interface TranslateErrorMeta {
  status?: number;
  cause?: unknown;
}

export class TranslateError extends Error {
  readonly kind: TranslateErrorKind;
  readonly status?: number;

  constructor(
    kind: TranslateErrorKind,
    message: string,
    meta: TranslateErrorMeta = {},
  ) {
    super(
      message,
      meta.cause !== undefined ? { cause: meta.cause } : undefined,
    );
    this.name = "TranslateError";
    this.kind = kind;
    this.status = meta.status;
  }
}

/** Любую пойманную ошибку приводим к TranslateError (для единообразного UI). */
export function asTranslateError(error: unknown): TranslateError {
  if (error instanceof TranslateError) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);
  return new TranslateError("api", message, { cause: error });
}

/** Маппинг HTTP-статуса в типизированную ошибку. `label` — имя сервиса для текста. */
export function errorFromStatus(
  label: string,
  status: number,
  body: string,
): TranslateError {
  if (status === 401 || status === 403) {
    return new TranslateError(
      "auth",
      `${label} отклонил API-ключ (HTTP ${status}).`,
      { status },
    );
  }
  if (status === 429) {
    return new TranslateError(
      "rateLimit",
      `Превышен лимит запросов к ${label} (HTTP 429).`,
      { status },
    );
  }
  const snippet = body.trim().slice(0, 300);
  return new TranslateError(
    "api",
    `Ошибка API ${label}: HTTP ${status}.${snippet ? ` ${snippet}` : ""}`,
    { status },
  );
}
