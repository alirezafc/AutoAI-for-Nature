"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Leaf, Loader2 } from "lucide-react";
import { useI18n } from "@/components/i18n/intl-provider";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { safeLoginTarget, shouldRenderDemoHint } from "@/lib/auth/login-target";

export function AdminLoginForm({ from }: { from?: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const target = safeLoginTarget(from);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/register");
        const data = await res.json();
        if (data.needsSetup === true) {
          router.replace("/admin/setup");
        }
      } catch {
        // offline — keep form
      }
    })();
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? t("admin.login.invalid"));
        setLoading(false);
        return;
      }
      // Session cookie is now set. A FULL navigation guarantees the server
      // middleware evaluates it — the client router cache may still hold the
      // unauthenticated /admin payload, which previously left the spinner
      // hanging until a manual refresh.
      window.location.assign(target);
    } catch {
      setError(t("admin.login.invalid"));
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-accent/50 to-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Leaf className="h-6 w-6" />
          </span>
          <h1 className="text-xl font-black tracking-tight">{t("admin.login.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("admin.login.subtitle")}</p>
        </div>
        <Card>
          <CardContent className="p-6">
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{t("admin.login.email")}</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@autoai.local"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{t("admin.login.password")}</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {t("admin.login.signIn")}
              </Button>
              {shouldRenderDemoHint(process.env.NODE_ENV) && (
                <p className="text-center text-xs text-muted-foreground">
                  {/* Development-only literal: never shipped to production UI (see shouldRenderDemoHint). */}
                  {"Default credentials are set in .env.local"}
                </p>
              )}
            </form>
          </CardContent>
        </Card>
        <Link
          href="/"
          className="mt-4 flex items-center justify-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> {t("common.back")}
        </Link>
      </div>
    </div>
  );
}
