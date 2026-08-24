"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, BookOpen, Bot, Database, MessageSquare, RefreshCw, Sparkles, Zap, Globe } from "lucide-react";
import { useI18n } from "@/components/i18n/intl-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Select } from "@/components/ui/input";
import { formatDateTime, timeAgo } from "@/lib/utils";

type Run = {
  id: string;
  topic: string;
  language: string;
  status: string;
  createdAt: string;
  steps: { agent: string; status: string; score: number | null; revision: number }[];
};

type Stats = {
  stats: {
    posts: { published: number; drafts: number; needsReview: number };
    conversations: number;
    knowledgeDocuments: number;
    vectorStats: { documents: number; chunks: number };
    agentRuns: { total: number; succeeded: number; failed: number; avgDurationMs: number; byStatus: { status: string; value: number }[] };
    ragQueries: number;
  };
};

type HealthInfo = {
  ai: { mode: string; configuredProviders: string[]; allProviders: { key: string; name: string; configured: boolean }[] };
  database: { mode: string; knowledgeDocuments: number; knowledgeChunks: number };
};

export default function AdminOverview() {
  const { t } = useI18n();
  const [runs, setRuns] = useState<Run[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [topic, setTopic] = useState("");
  const [language, setLanguage] = useState<"en" | "fa">("en");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const [r, s, h] = await Promise.all([
      fetch("/api/agent-runs").then((x) => x.json()),
      fetch("/api/admin/stats").then((x) => x.json()),
      fetch("/api/health").then((x) => x.json()),
    ]);
    setRuns(r.runs ?? []);
    setStats(s);
    setHealth(h);
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, []);

  async function startRun() {
    if (!topic.trim() || starting) return;
    setStarting(true);
    setError("");
    const res = await fetch("/api/agent-runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic: topic.trim(), language }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? t("common.genericError"));
      setStarting(false);
      return;
    }
    const data = await res.json().catch(() => null);
    if (data?.runId) {
      window.location.href = `/admin/runs/${data.runId}`;
      return;
    }
    setTopic("");
    load();
    setStarting(false);
  }

  const aiMode = health?.ai?.mode ?? "demo";
  const isLive = aiMode === "live";

  const cards = [
    { label: t("admin.overview.postsCount"), value: stats?.stats.posts.published ?? 0, icon: BookOpen },
    { label: t("admin.overview.aiRuns"), value: stats?.stats.agentRuns.total ?? 0, icon: Bot },
    { label: t("admin.overview.ragQueries"), value: stats?.stats.ragQueries ?? 0, icon: Activity },
    { label: t("common.documents"), value: stats?.stats.knowledgeDocuments ?? 0, icon: Database },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight">{t("admin.overview.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("admin.overview.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={isLive ? "default" : "secondary"} className="gap-1.5">
            <Zap className={`h-3 w-3 ${isLive ? "text-green-500" : "text-muted-foreground"}`} />
            {isLive ? t("common.liveAi") : t("common.demoModeLabel")}
          </Badge>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="h-4 w-4" /> {t("common.refresh")}
          </Button>
        </div>
      </div>

      {!isLive && (
        <Card className="border-dashed">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
                <Sparkles className="h-4 w-4" />
              </span>
              <div className="text-sm">
                <div className="font-semibold">{t("admin.overview.demoHintTitle")}</div>
                <div className="text-xs text-muted-foreground">{t("admin.overview.demoHintBody")}</div>
              </div>
            </div>
            <Button asChild size="sm" variant="outline">
              <a href="/admin/settings" target="_blank" rel="noopener noreferrer">
                {t("admin.overview.demoHintCta")}
              </a>
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">{t("admin.articles.generate")}</h2>
            {!isLive && (
              <Badge variant="outline" className="text-xs text-muted-foreground">{t("common.mockProvider")}</Badge>
            )}
          </div>          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <Label className="sr-only">{t("admin.agentRuns.topic")}</Label>
              <Input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder={t("admin.agentRuns.topicPlaceholder")}
              />
            </div>
            <Select value={language} onChange={(e) => setLanguage(e.target.value as "en" | "fa")} className="sm:w-32">
              <option value="en">{t("common.en")}</option>
              <option value="fa">{t("common.fa")}</option>
            </Select>
            <Button onClick={startRun} disabled={starting || !topic.trim()}>
              <Bot className="h-4 w-4" />
              {t("admin.overview.startRun")}
            </Button>
          </div>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardContent className="flex items-center gap-4 p-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <c.icon className="h-5 w-5" />
              </span>
              <div>
                <div className="text-2xl font-black">{c.value}</div>
                <div className="text-xs text-muted-foreground">{c.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Zap className="h-4 w-4" /> {t("common.aiProvider")}
            </div>
            <div className="space-y-1">
              {(health?.ai?.allProviders ?? []).map((p) => (
                <div key={p.key} className="flex items-center justify-between text-xs">
                  <span>{p.name}</span>
                  <Badge variant={p.configured ? "default" : "secondary"} className="text-[10px]">
                    {p.configured ? t("common.connected") : t("common.notConfigured")}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Database className="h-4 w-4" /> {t("common.database")}
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between"><span>{t("common.mode")}</span><span className="font-mono">{health?.database?.mode ?? "—"}</span></div>
              <div className="flex justify-between"><span>{t("common.knowledgeDocs")}</span><span>{health?.database?.knowledgeDocuments ?? 0}</span></div>
              <div className="flex justify-between"><span>{t("common.vectorChunks")}</span><span>{health?.database?.knowledgeChunks ?? 0}</span></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Globe className="h-4 w-4" /> {t("common.publicSite")}
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between"><span>{t("common.articles")}</span><span>{stats?.stats.posts.published ?? 0}</span></div>
              <div className="flex justify-between"><span>{t("common.conversations")}</span><span>{stats?.stats.conversations ?? 0}</span></div>
              <div className="flex justify-between"><span>{t("common.ragQueries")}</span><span>{stats?.stats.ragQueries ?? 0}</span></div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">{t("admin.overview.latestRuns")}</h2>
          <Link href="/admin/runs" className="text-sm text-primary hover:underline">
            {t("common.view")}
          </Link>
        </div>
        {runs.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              {t("common.emptyState")}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {runs.map((run) => (
              <Card key={run.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <Link href={`/admin/runs/${run.id}`} className="font-medium hover:text-primary">
                      {run.topic}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {formatDateTime(run.createdAt)} · {run.language === "fa" ? t("common.fa") : t("common.en")} ·{" "}
                      {run.steps.length} {t("common.steps")}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={run.status === "completed" ? "default" : run.status === "failed" ? "destructive" : "secondary"}>
                      {run.status === "waiting_for_human" ? t("common.waitingForHuman") : t(`common.${run.status}`) ?? run.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{timeAgo(run.createdAt)}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
