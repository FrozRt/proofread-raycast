/**
 * Контракт ядра перевода.
 *
 * Ядро (prompt/lib/providers) НЕ импортирует `@raycast/api`: получает apiKey/model
 * явными аргументами (DI), поэтому ту же `translate()` гоняет и UI, и headless
 * scripts/eval.ts. Приложение работает только с Gemini.
 */

export interface TranslateOptions {
  apiKey: string;
  model: string;
  /** Язык поясняющего блока (например "Russian"). */
  explanationLanguage: string;
  /** Форсировать блок даже для простых фраз (preference alwaysExplain). */
  alwaysExplain: boolean;
  /** Опциональная внешняя отмена (на таймаут провайдер ставит свою). */
  signal?: AbortSignal;
}

export interface TranslateResult {
  /** Перевод (защищённые токены оставлены как есть). */
  translation: string;
  /** Готовый markdown поясняющего блока или null, если по правилам §3 он не нужен. */
  explanation: string | null;
}
