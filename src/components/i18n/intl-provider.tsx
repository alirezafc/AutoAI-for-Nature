"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  DEFAULT_LOCALE,
  getDictionary,
  isLocale,
  isRTL,
  LOCALES,
  translate,
  type Locale,
  type Translator,
} from "@/lib/i18n";

interface IntlContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Translator;
  dir: "ltr" | "rtl";
  locales: Locale[];
}

const IntlContext = createContext<IntlContextValue | null>(null);

const COOKIE = "autoai_locale";

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : undefined;
}

function writeCookie(name: string, value: string): void {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`;
}

export function IntlProvider({
  children,
  initialLocale,
}: {
  children: ReactNode;
  initialLocale: Locale;
}) {
  const router = useRouter();
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  useEffect(() => {
    const stored = readCookie(COOKIE);
    if (stored && isLocale(stored)) {
      setLocaleState(stored);
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = isRTL(locale) ? "rtl" : "ltr";
  }, [locale]);

  /**
   * Single authoritative locale transition:
   * cookie (persistence) -> client state (client-side messages) ->
   * router.refresh() so EVERY server component re-renders with the new
   * locale cookie. Without the refresh, server-rendered text stays in the
   * previous language while only direction flips — the exact production bug.
   */
  const setLocale = useCallback(
    (next: Locale) => {
      setLocaleState(next);
      writeCookie(COOKIE, next);
      document.documentElement.lang = next;
      document.documentElement.dir = isRTL(next) ? "rtl" : "ltr";
      router.refresh();
    },
    [router]
  );

  const value = useMemo<IntlContextValue>(() => {
    const dict = getDictionary(locale);
    return {
      locale,
      setLocale,
      t: (key, params) => translate(dict, key, params),
      dir: isRTL(locale) ? "rtl" : "ltr",
      locales: LOCALES,
    };
  }, [locale, setLocale]);

  return <IntlContext.Provider value={value}>{children}</IntlContext.Provider>;
}

export function useI18n(): IntlContextValue {
  const ctx = useContext(IntlContext);
  if (!ctx) {
    return {
      locale: DEFAULT_LOCALE,
      setLocale: () => undefined,
      t: (key) => key,
      dir: "ltr",
      locales: LOCALES,
    };
  }
  return ctx;
}
