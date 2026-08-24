"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Bot, Check, Clock, Loader2, RotateCcw, X } from "lucide-react";
import { useI18n } from "@/components/i18n/intl-provider";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/utils";

type Step = {
  id: string;
  agent: string;
  status: string;
  provider?: string | null;
  model?: string | null;
  revision: number;
  startedAt?: string | null;
  finishedAt?: string | null;
  durationMs?: number | null;
  inputSummary: string;
  outputSummary: string;
  output?: unknown;
  score?: number | null;
  error?: string | null;
};

type Run = {
  id: string;
  topic: string;
  language: string;
  status: string;
  runType: string;
  categoryId?: string | null;
  postId?: string | null;
  createdAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  durationMs?: number | null;
  updatedAt?: string | null;
  steps: Step[];
};

export default function RunDetailPage() {
  const params = useParams<{ id: string }>();
  const { t } = useI18n();
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState("");
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    let alive = true;
    async function load() {
      const res = await fetch(`/api/agent-runs/${params.id}`);
      if (!res.ok) {
        setError(t("common.runNotFound"));
        return;
      }
      const data = await res.json();
      if (alive) setRun(data.run);
    }
    load();
    const id = setInterval(load, 4000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [params.id]);

  async function retry() {
    setRetrying(true);
    try {
      const res = await fetch(`/api/agent-runs/${params.id}`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.runId) {
        window.location.href = `/admin/runs/${data.runId}`;
        return;
      }
      setError(data?.error ?? t("common.genericError"));
    } finally {
      setRetrying(false);
    }
  }

  if (error) {
    return <p className="text-destructive">{error}</p>;
  }

  if (!run) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
      </div>
    );
  }

  const stepsByAgent = new Map<string, Step[]>();
  for (const s of run.steps) {
    const list = stepsByAgent.get(s.agent) ?? [];
    list.push(s);
    stepsByAgent.set(s.agent, list);
  }

  const totalDuration = run.durationMs ?? sumDurations(run.steps);
  const failed = run.status === "failed";
  const active = run.status === "running" || run.status === "queued";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/admin/runs"
            className="mb-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> {t("admin.articles.back")}
          </Link>
          <h1 className="max-w-2xl text-2xl font-black tracking-tight">{run.topic}</h1>
          <p className="text-sm text-muted-foreground">
            {run.language === "fa" ? t("common.fa") : t("common.en")} · {formatDateTime(run.createdAt)} ·{" "}
            {run.runType}
            {totalDuration != null && <> · {t("admin.agentRuns.totalTime")} {formatDuration(totalDuration, t)}</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant={
              run.status === "completed"
                ? "default"
                : run.status === "failed"
                  ? "destructive"
                  : "secondary"
            }
          >
            {run.status === "waiting_for_human"
              ? t("common.waitingForHuman")
              : t(`common.${run.status}`)}
          </Badge>
          {run.postId && (
            <Button asChild size="sm" variant="outline">
              <Link href={`/admin/posts/${run.postId}`}>{t("admin.agentRuns.viewArticle")}</Link>
            </Button>
          )}
          {failed && (
            <Button size="sm" onClick={retry} disabled={retrying} variant="outline">
              {retrying ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              {t("admin.agentRuns.retry")}
            </Button>
          )}
        </div>
      </div>

      {/* Timeline */}
      <Card>
        <CardContent className="p-5">
          <h2 className="mb-4 font-semibold">{t("admin.agentRuns.timelineTitle")}</h2>
          <div className="flex flex-wrap items-center gap-1.5">
            {run.steps.map((step, i) => {
              const done = step.status === "completed";
              const stepFailed = step.status === "failed";
              const running = step.status === "running";
              return (
                <div key={step.id} className="flex items-center gap-1.5">
                  <div
                    title={`${t(`admin.agentRuns.${step.agent}`)} · ${step.status}${
                      step.durationMs != null ? ` · ${formatDuration(step.durationMs, t)}` : ""
                    }${step.revision > 0 ? ` · ${t("admin.agentRuns.revision")} ${step.revision}` : ""}`}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${
                      done
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : stepFailed
                          ? "border-destructive/40 bg-destructive/10 text-destructive"
                          : running
                            ? "border-amber-400/40 bg-amber-400/10 text-amber-600"
                            : "border-border text-muted-foreground"
                    }`}
                  >
                    {done ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : stepFailed ? (
                      <X className="h-3.5 w-3.5" />
                    ) : running ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Clock className="h-3.5 w-3.5" />
                    )}
                    <span className="hidden sm:inline">{t(`admin.agentRuns.${step.agent}`)}</span>
                    <span className="sm:hidden">{step.agent.slice(0, 1).toUpperCase()}</span>
                    {step.revision > 0 && (
                      <span className="rounded bg-muted px-1">{step.revision}</span>
                    )}
                    {step.score != null && <span className="ml-0.5">{step.score}%</span>}
                  </div>
                  {i < run.steps.length - 1 && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/50" />}
                </div>
              );
            })}
          </div>
          {active && (
            <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("admin.agentRuns.polling")}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Steps detail */}
      {run.steps.length === 0 ? (
        <Card>
          <CardContent className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
            <Bot className="h-4 w-4" /> {t("admin.agentRuns.noSteps")}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {run.steps.map((step, i) => {
            const maxDur = Math.max(...run.steps.map((s) => s.durationMs ?? 0), 1);
            const dur = step.durationMs ?? 0;
            return (
              <Card key={step.id}>
                <CardContent className="p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-muted-foreground">0{i + 1}</span>
                      <span className="font-semibold">{t(`admin.agentRuns.${step.agent}`)}</span>
                      {step.revision > 0 && (
                        <Badge variant="secondary">
                          {t("admin.agentRuns.revision")} {step.revision}
                        </Badge>
                      )}
                      <Badge
                        variant={
                          step.status === "completed"
                            ? "default"
                            : step.status === "failed"
                              ? "destructive"
                              : step.status === "running"
                                ? "secondary"
                                : "outline"
                        }
                      >
                        {t(`common.${step.status}`)}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {step.provider && <span>{step.provider}/{step.model}</span>}
                      {step.score != null && (
                        <span className="font-medium text-primary">{step.score}%</span>
                      )}
                      {dur > 0 && <span>{formatDuration(dur, t)}</span>}
                    </div>
                  </div>

                  {/* duration bar */}
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full ${
                        step.status === "failed"
                          ? "bg-destructive"
                          : step.status === "running"
                            ? "bg-amber-400"
                            : "bg-primary"
                      }`}
                      style={{ width: `${Math.max(4, Math.round((dur / maxDur) * 100))}%` }}
                    />
                  </div>

                  {(step.inputSummary || step.outputSummary) && (
                    <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                      {step.inputSummary && (
                        <div className="rounded-lg bg-muted/50 p-3">
                          <div className="mb-1 text-xs font-semibold text-muted-foreground">
                            {t("admin.agentRuns.inputSummary")}
                          </div>
                          <p className="line-clamp-3 text-muted-foreground">{step.inputSummary}</p>
                        </div>
                      )}
                      {step.outputSummary && (
                        <div className="rounded-lg bg-muted/50 p-3">
                          <div className="mb-1 text-xs font-semibold text-muted-foreground">
                            {t("admin.agentRuns.outputSummary")}
                          </div>
                          <p className="line-clamp-3 text-muted-foreground">{step.outputSummary}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {step.error && <p className="mt-2 text-sm text-destructive">{step.error}</p>}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function sumDurations(steps: Step[]): number | null {
  const dur = steps.filter((s) => s.durationMs != null).reduce((a, b) => a + (b.durationMs ?? 0), 0);
  return dur > 0 ? dur : null;
}

function formatDuration(ms: number, t: (key: string) => string): string {
  if (ms < 1000) return `${ms}${t("common.ms")}`;
  return `${(ms / 1000).toFixed(1)}${t("common.seconds")}`;
}