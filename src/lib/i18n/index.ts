import en from "../../../messages/en.json";
import fa from "../../../messages/fa.json";

export type Locale = "en" | "fa";
export type Dictionary = typeof en;

export const dictionaries: Record<Locale, Dictionary> = { en, fa };

export const DEFAULT_LOCALE: Locale = "en";

export const LOCALES: Locale[] = ["en", "fa"];

export function isLocale(value: string | undefined): value is Locale {
  return value === "en" || value === "fa";
}

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE];
}

export function isRTL(locale: Locale): boolean {
  return locale === "fa";
}

/** All leaf translation keys of a dictionary, dot-notation ("admin.models.title"). */
export function flattenKeys(dict: unknown, prefix = ""): string[] {
  if (!dict || typeof dict !== "object") return [];
  return Object.entries(dict as Record<string, unknown>).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return value && typeof value === "object" ? flattenKeys(value, path) : [path];
  });
}

type Params = Record<string, string | number>;

function resolvePath(obj: unknown, path: string): unknown {
  let current: unknown = obj;
  for (const part of path.split(".")) {
    if (current && typeof current === "object" && part in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

export function translate(dictionary: Dictionary, key: string, params?: Params): string {
  let raw: unknown = resolvePath(dictionary, key);
  if (typeof raw !== "string") {
    raw = resolvePath(dictionaries[DEFAULT_LOCALE], key);
  }
  if (typeof raw !== "string") {
    return key;
  }
  let value: string = raw;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      value = value.replaceAll(`{{${k}}}`, String(v));
    }
  }
  return value;
}

export type Translator = (key: string, params?: Params) => string;

export function createTranslator(locale: Locale): Translator {
  const dict = getDictionary(locale);
  return (key, params) => translate(dict, key, params);
}
