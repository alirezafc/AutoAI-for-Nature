import { describe, expect, it } from "vitest";
import { createTranslator, DEFAULT_LOCALE, getDictionary, isLocale, isRTL, translate } from "./index";
import en from "../../../messages/en.json";

describe("i18n", () => {
  it("recognizes supported locales", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("fa")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });

  it("flags Persian as RTL", () => {
    expect(isRTL("fa")).toBe(true);
    expect(isRTL("en")).toBe(false);
  });

  it("resolves nested keys and falls back to the default locale", () => {
    expect(translate(getDictionary("en"), "common.save")).toBe(en.common.save);
    expect(translate(getDictionary("en"), "missing.key")).toBe("missing.key");
  });

  it("interpolates parameters", () => {
    const dict = getDictionary("en");
    const raw = translate(dict, "blog.minRead", { n: 12 });
    expect(raw).toBe("12 min read");
  });

  it("creates a bound translator", () => {
    const t = createTranslator(DEFAULT_LOCALE);
    expect(typeof t).toBe("function");
    expect(t("common.loading")).toBe(en.common.loading);
  });
});
