import { describe, expect, it } from "vitest";
import {
  createTranslator,
  DEFAULT_LOCALE,
  flattenKeys,
  getDictionary,
  isLocale,
  isRTL,
  translate,
} from "./index";
import en from "../../../messages/en.json";
import fa from "../../../messages/fa.json";

describe("i18n", () => {
  it("recognizes supported locales", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("fa")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });

  it("flags Persian as RTL and English as LTR (direction derives from locale)", () => {
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

  it("switching locale actually changes translated strings (EN↔FA)", () => {
    const enT = createTranslator("en");
    const faT = createTranslator("fa");
    // A stable, always-present key pair with distinct scripts:
    expect(enT("admin.login.title")).toMatch(/^[A-Za-z]/);
    expect(faT("admin.login.title")).toMatch(/[\u0600-\u06FF]/);
    expect(enT("admin.login.title")).not.toBe(faT("admin.login.title"));
  });

  it("both locales expose IDENTICAL translation-key sets (missing keys = 0)", () => {
    const enKeys = flattenKeys(en).sort();
    const faKeys = flattenKeys(fa).sort();
    expect(enKeys.length).toBeGreaterThan(0);
    expect(faKeys).toEqual(enKeys);
  });

  it("contains no empty translations in either locale", () => {
    for (const dict of [en, fa] as Record<string, unknown>[]) {
      for (const key of flattenKeys(dict)) {
        const value = key.split(".").reduce<unknown>((acc, part) => {
          return acc && typeof acc === "object" ? (acc as Record<string, unknown>)[part] : undefined;
        }, dict);
        expect(typeof value === "string" ? value : undefined).toBeTruthy();
      }
    }
  });
});
