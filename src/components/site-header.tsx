"use client";

import Link from "next/link";
import { Leaf } from "lucide-react";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { useI18n } from "@/components/i18n/intl-provider";

export function SiteHeader() {
  const { t } = useI18n();
  const links = [
    { href: "/", label: t("nav.home") },
    { href: "/blog", label: t("nav.blog") },
    { href: "/chat", label: t("nav.chat") },
    { href: "/voice", label: t("nav.voice") },
  ];
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="container flex h-14 items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2 font-bold tracking-tight">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Leaf className="h-4 w-4" />
          </span>
          <span className="flex items-baseline gap-1">
            Auto<span className="text-primary">AI</span>
            <span className="hidden text-xs font-semibold text-muted-foreground sm:inline">for Nature</span>
          </span>
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <LocaleSwitcher />
          <Link
            href="/admin"
            className="rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent"
          >
            {t("nav.admin")}
          </Link>
        </div>
      </div>
    </header>
  );
}
