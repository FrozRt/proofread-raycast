import {
  Action,
  ActionPanel,
  Detail,
  Form,
  Icon,
  getPreferenceValues,
  openExtensionPreferences,
  useNavigation,
} from "@raycast/api";
import { showFailureToast } from "@raycast/utils";
import { useEffect, useState } from "react";
import { DEFAULT_MODEL, translate } from "./providers";
import type { TranslateOptions, TranslateResult } from "./providers/types";
import {
  TranslateError,
  type TranslateErrorKind,
  asTranslateError,
} from "./lib/errors";

const API_KEY_URL = "https://aistudio.google.com/app/apikey";

/** Резолвим preferences (manifest -> raycast-env.d.ts) в опции для ядра. */
function resolveOptions(): TranslateOptions {
  const prefs = getPreferenceValues<Preferences>();
  return {
    apiKey: (prefs.apiKey ?? "").trim(),
    model: (prefs.model ?? "").trim() || DEFAULT_MODEL,
    explanationLanguage: (prefs.explanationLanguage ?? "").trim() || "Russian",
    alwaysExplain: Boolean(prefs.alwaysExplain),
  };
}

type ViewState =
  | { status: "loading" }
  | { status: "ok"; result: TranslateResult }
  | { status: "error"; error: TranslateError };

function composeResult(result: TranslateResult): string {
  return result.explanation
    ? `${result.translation}\n\n---\n\n${result.explanation}`
    : result.translation;
}

function errorTitle(error: TranslateError): string {
  switch (error.kind) {
    case "empty":
      return "Пустой ввод";
    case "auth":
      return "Нужен Gemini API-ключ";
    case "rateLimit":
      return "Лимит запросов";
    case "timeout":
      return "Таймаут";
    case "network":
      return "Нет соединения";
    case "parse":
      return "Пустой ответ модели";
    case "api":
      return "Ошибка API";
  }
}

const ERROR_HINTS: Record<TranslateErrorKind, string> = {
  empty: "Введите текст и повторите.",
  auth: `Нужен Gemini API-ключ — он **бесплатный**: получите на [aistudio.google.com](${API_KEY_URL}) (Get API key) и вставьте в настройках расширения.`,
  rateLimit:
    "Слишком много запросов. Подождите несколько секунд и попробуйте снова.",
  timeout:
    "Gemini не ответил за 30 секунд. Проверьте сеть или попробуйте ещё раз.",
  network: "Не удалось соединиться с Gemini. Проверьте интернет.",
  parse: "Gemini вернул пустой или нечитаемый ответ. Попробуйте ещё раз.",
  api: "Gemini вернул ошибку. Подробности ниже.",
};

function errorMarkdown(error: TranslateError): string {
  return [
    `# ⚠️ ${errorTitle(error)}`,
    "",
    ERROR_HINTS[error.kind],
    "",
    "```",
    error.message,
    "```",
  ].join("\n");
}

/** Экран результата: запрос в useEffect, состояния loading/ok/error. */
function ResultView({ input }: { input: string }) {
  const [state, setState] = useState<ViewState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    (async () => {
      try {
        const result = await translate(input, {
          ...resolveOptions(),
          signal: controller.signal,
        });
        if (!cancelled) {
          setState({ status: "ok", result });
        }
      } catch (raw) {
        if (cancelled) {
          return;
        }
        const error = asTranslateError(raw);
        setState({ status: "error", error });
        void showFailureToast(error, { title: errorTitle(error) });
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [input]);

  if (state.status === "loading") {
    const quoted = input.replace(/\n/g, "\n> ");
    return (
      <Detail
        isLoading
        navigationTitle="Polyglot"
        markdown={`> ${quoted}\n\n_Перевожу…_`}
      />
    );
  }

  if (state.status === "error") {
    const { error } = state;
    return (
      <Detail
        navigationTitle="Polyglot — ошибка"
        markdown={errorMarkdown(error)}
        actions={
          <ActionPanel>
            <Action
              title="Открыть настройки расширения"
              icon={Icon.Gear}
              onAction={openExtensionPreferences}
            />
            {error.kind === "auth" && (
              <Action.OpenInBrowser
                title="Получить бесплатный ключ (AI Studio)"
                url={API_KEY_URL}
                icon={Icon.Key}
              />
            )}
            <Action.CopyToClipboard
              title="Скопировать текст ошибки"
              content={error.message}
            />
          </ActionPanel>
        }
      />
    );
  }

  const { result } = state;
  return (
    <Detail
      navigationTitle="Polyglot"
      markdown={composeResult(result)}
      actions={
        <ActionPanel>
          <Action.CopyToClipboard
            title="Скопировать результат"
            content={composeResult(result)}
          />
          <Action.CopyToClipboard
            title="Скопировать только перевод"
            content={result.translation}
          />
          <Action
            title="Открыть настройки расширения"
            icon={Icon.Gear}
            onAction={openExtensionPreferences}
          />
        </ActionPanel>
      }
    />
  );
}

/** Команда: форма ввода -> push экрана результата. */
export default function Command() {
  const { push } = useNavigation();
  const [error, setError] = useState<string | undefined>();

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Перевести"
            icon={Icon.Globe}
            onSubmit={(values: { text: string }) => {
              const text = (values.text ?? "").trim();
              if (text === "") {
                setError("Введите текст");
                return;
              }
              push(<ResultView input={text} />);
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextArea
        id="text"
        title="Текст"
        placeholder="Введите текст на русском или английском — направление определится автоматически…"
        autoFocus
        error={error}
        onChange={() => {
          if (error) {
            setError(undefined);
          }
        }}
      />
    </Form>
  );
}
