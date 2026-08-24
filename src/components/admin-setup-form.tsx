"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Leaf, Loader2 } from "lucide-react";
import { useI18n } from "@/components/i18n/intl-provider";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

export function AdminSetupForm() {
  const { t } = useI18n();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/register");
        const data = await res.json();
        if (data.needsSetup === false) {
          router.replace("/admin/login");
        }
      } catch {
        // offline / build — keep form
      }
    })();
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? t("admin.setup.failed"));
        setLoading(false);
        return;
      }
      router.replace("/admin");
      router.refresh();
    } catch {
      setError(t("admin.setup.failed"));
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
          <h1 className="text-xl font-black tracking-tight">{t("admin.setup.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("admin.setup.subtitle")}</p>
        </div>
        <Card>
          <CardContent className="p-6">
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">{t("admin.setup.name")}</Label>
                <Input
                  id="name"
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Admin"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">{t("admin.setup.email")}</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{t("admin.setup.password")}</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
                <p className="text-xs text-muted-foreground">{t("admin.setup.passwordHint")}</p>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {t("admin.setup.createAccount")}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
