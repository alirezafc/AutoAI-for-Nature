import { cookies } from "next/headers";
import {
  DEFAULT_LOCALE,
  createTranslator,
  isLocale,
  isRTL,
  type Locale,
  type Translator,
} from "./index";

export interface ServerI18n {
  locale: Locale;
  t: Translator;
  dir: "ltr" | "rtl";
}

export async function getServerI18n(): Promise<ServerI18n> {
  const store = await cookies();
  const cookie = store.get("autoai_locale")?.value;
  const locale: Locale = cookie && isLocale(cookie) ? cookie : DEFAULT_LOCALE;
  return {
    locale,
    t: createTranslator(locale),
    dir: isRTL(locale) ? "rtl" : "ltr",
  };
}
