/**
 * A single translation error type discriminated by `kind`.
 *
 * One class with a union `kind` field instead of a class hierarchy
 * (AuthError/RateLimitError/…): the UI maps it with an exhaustive
 * `switch (error.kind)` rather than an instanceof chain, with less boilerplate.
 */

export type TranslateErrorKind =
  | "empty" // empty input — nothing to translate
  | "auth" // key missing or rejected (401/403)
  | "rateLimit" // 429
  | "timeout" // the AbortController timeout fired
  | "network" // the connection failed
  | "parse" // the service returned an empty/unparseable envelope
  | "api"; // any other non-2xx response

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

/** Normalize any caught value to a TranslateError (for uniform UI handling). */
export function asTranslateError(error: unknown): TranslateError {
  if (error instanceof TranslateError) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);
  return new TranslateError("api", message, { cause: error });
}

/**
 * Map an HTTP status to a typed error. `label` is the service name shown to the
 * user. The raw response body is kept only in `cause` (for debugging) and is
 * never spliced into the user-facing message.
 */
export function errorFromStatus(
  label: string,
  status: number,
  body: string,
): TranslateError {
  if (status === 401 || status === 403) {
    return new TranslateError(
      "auth",
      `${label} rejected the API key (HTTP ${status}).`,
      { status, cause: body },
    );
  }
  if (status === 429) {
    return new TranslateError(
      "rateLimit",
      `${label} rate limit exceeded (HTTP 429).`,
      { status, cause: body },
    );
  }
  return new TranslateError("api", `${label} API error: HTTP ${status}.`, {
    status,
    cause: body,
  });
}
