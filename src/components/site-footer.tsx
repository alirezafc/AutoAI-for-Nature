"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/intl-provider";

export function SiteFooter() {
  const { t } = useI18n();
  return (
    <footer className="border-t bg-muted/30">
      <div className="container flex flex-col items-center justify-between gap-4 py-8 text-sm text-muted-foreground md:flex-row">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground">
            Auto<span className="text-primary">AI</span> for Nature
          </span>
          <span>·</span>
          <span>{t("common.footerTagline")}</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/blog" className="hover:text-foreground">
            {t("nav.blog")}
          </Link>
          <Link href="/chat" className="hover:text-foreground">
            {t("nav.chat")}
          </Link>
          <Link href="/voice" className="hover:text-foreground">
            {t("nav.voice")}
          </Link>
          <Link href="/api/health" className="hover:text-foreground">
            API
          </Link>
        </div>
        <span>© {new Date().getFullYear()} AutoAI for Nature</span>
      </div>
    </footer>
  );
}
