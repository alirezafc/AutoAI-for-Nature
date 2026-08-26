"use client";

import { useI18n } from "@/components/i18n/intl-provider";
import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LocaleSwitcher() {
  const { locale, setLocale, locales, t } = useI18n();
  const next = locales.find((l) => l !== locale) ?? "en";
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setLocale(next)}
      className="gap-1.5"
      aria-label={t("common.language")}
    >
      <Languages className="h-4 w-4" />
      <span className="uppercase">{next}</span>
    </Button>
  );
}
