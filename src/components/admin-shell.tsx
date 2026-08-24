"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Bot,
  BookOpen,
  Database,
  LayoutDashboard,
  MessageSquare,
  Mic,
  Settings,
  Sparkles,
  Workflow,
  Cable,
} from "lucide-react";
import { useI18n } from "@/components/i18n/intl-provider";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin", label: "overview", icon: LayoutDashboard },
  { href: "/admin/posts", label: "articles", icon: BookOpen },
  { href: "/admin/runs", label: "agentRuns", icon: Bot },
  { href: "/admin/knowledge", label: "knowledge", icon: Database },
  { href: "/admin/conversations", label: "conversations", icon: MessageSquare },
  { href: "/admin/voice", label: "voiceAgent", icon: Mic },
  { href: "/admin/models", label: "models", icon: Sparkles },
  { href: "/admin/mcp", label: "mcp", icon: Cable },
  { href: "/admin/workflows", label: "workflows", icon: Workflow },
  { href: "/admin/settings", label: "settings", icon: Settings },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useI18n();

  if (pathname.startsWith("/admin/login")) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-card lg:flex">
        <Link href="/admin" className="flex items-center gap-2 px-4 py-4 font-bold tracking-tight">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Bot className="h-4 w-4" />
          </span>
          AutoAI <span className="text-primary">for Nature</span>
        </Link>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-2">
          {NAV.map((item) => {
            const active =
              item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <item.icon className="h-4 w-4" />
                {t(`admin.nav.${item.label}`)}
              </Link>
            );
          })}
        </nav>
        <div className="space-y-1 border-t p-2">
          <Link
            href="/"
            className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("admin.nav.backToSite")}
          </Link>
          <button
            type="button"
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              window.location.href = "/admin/login";
            }}
            className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Settings className="h-4 w-4" />
            {t("admin.nav.logout")}
          </button>
        </div>
      </aside>
      <div className="flex-1">
        <MobileNav pathname={pathname} />
        <main className="p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}

function MobileNav({ pathname }: { pathname: string }) {
  const { t } = useI18n();
  return (
    <div className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur lg:hidden">
      <div className="flex gap-1 overflow-x-auto px-2 py-2">
        {NAV.map((item) => {
          const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              )}
            >
              {t(`admin.nav.${item.label}`)}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
