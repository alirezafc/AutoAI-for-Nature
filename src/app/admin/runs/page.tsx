"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BarChart3, Bot, Clock, TrendingUp } from "lucide-react";
import { useI18n } from "@/components/i18n/intl-provider";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, timeAgo, formatDuration } from "@/lib/utils";

type Run = {
  id: string;
  topic: string;
  language: string;
  status: string;
  createdAt: string;
  steps: { agent: string; status: string; score: number | null; revision: number }[];
};

type Report = {
  total: number;
  succeeded: number;
  failed: number;
  avgDurationMs: number;
  byStatus: { status: string; value: number }[];
};

export default function RunsPage() {
  const { t } = useI18n();
  const [runs, setRuns] = useState<Run[]>([]);
  const [report, setReport] = useState<Report | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      const [runsRes, statsRes] = await Promise.all([
        fetch("/api/agent-runs?limit=100"),
        fetch("/api/admin/stats"),
      ]);
      const runsData = await runsRes.json();
      const statsData = await statsRes.json();
      if (alive) {
        setRuns(runsData.runs ?? []);
        setReport(statsData?.stats?.agentRuns ?? null);
      }
    }
    load();
    const id = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const perAgent = useMemo(() => {
    const map = new Map<string, { runs: number; success: number }>();
    for (const run of runs) {
      for (const s of run.steps) {
        const cur = map.get(s.agent) ?? { runs: 0, success: 0 };
        cur.runs += 1;
        if (s.status === "completed") cur.success += 1;
        map.set(s.agent, cur);
      }
    }
    return [...map.entries()].sort((a, b) => b[1].runs - a[1].runs);
  }, [runs]);

  const successRate = report && report.total > 0 ? Math.round((report.succeeded / report.total) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight">{t("admin.agentRuns.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("admin.agentRuns.subtitle")}</p>
      </div>

      {report && report.total > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-bold">{t("admin.agentRuns.reportTitle")}</h2>
            <p className="text-xs text-muted-foreground">{t("admin.agentRuns.subtitle")}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="flex items-center gap-4 p-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Bot className="h-5 w-5" />
              </span>
              <div>
                <div className="text-2xl font-black">{report.total}</div>
                <div className="text-xs text-muted-foreground">{t("admin.agentRuns.totalRuns")}</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-4 p-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
                <TrendingUp className="h-5 w-5" />
              </span>
              <div>
                <div className="text-2xl font-black">{successRate}%</div>
                <div className="text-xs text-muted-foreground">{t("admin.agentRuns.successRate")}</div>
                <div className="text-[10px] text-muted-foreground">
                  {report.succeeded} · {report.failed}
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-4 p-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
                <Clock className="h-5 w-5" />
              </span>
              <div>
                <div className="text-2xl font-black">{formatDuration(report.avgDurationMs)}</div>
                <div className="text-xs text-muted-foreground">{t("admin.agentRuns.avgDuration")}</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-4 p-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600">
                <BarChart3 className="h-5 w-5" />
              </span>
              <div>
                <div className="text-xs font-semibold">{t("admin.agentRuns.statusBreakdown")}</div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {report.byStatus.map((s) => (
                    <Badge key={s.status} variant={s.status === "completed" ? "default" : s.status === "failed" ? "destructive" : "secondary"} className="text-[10px]">
                      {t(`common.${s.status}`)}: {s.value}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        </section>
      )}

      {runs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-12 text-muted-foreground">
            <Bot className="h-8 w-8" />
            <span className="text-sm">{t("admin.agentRuns.noSteps")}</span>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {runs.map((run) => (
            <Link key={run.id} href={`/admin/runs/${run.id}`}>
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardContent className="space-y-3 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="line-clamp-1 font-semibold">{run.topic}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {formatDateTime(run.createdAt)} · {run.language === "fa" ? t("common.fa") : t("common.en")}
                      </div>
                    </div>
                    <Badge
                      variant={
                        run.status === "completed"
                          ? "default"
                          : run.status === "failed"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {run.status === "waiting_for_human" ? t("common.waitingForHuman") : t(`common.${run.status}`)}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {run.steps.map((s, i) => (
                      <span
                        key={i}
                        title={`${s.agent}${s.score != null ? ` · ${s.score}%` : ""}`}
                        className={`h-2 w-6 rounded-full ${
                          s.status === "completed"
                            ? "bg-primary"
                            : s.status === "failed"
                              ? "bg-destructive"
                              : s.status === "running"
                                ? "animate-pulse bg-amber-400"
                                : "bg-muted-foreground/25"
                        }`}
                      />
                    ))}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {run.steps.filter((s) => s.status === "completed").length}/{run.steps.length} ·{" "}
                    {timeAgo(run.createdAt)}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {perAgent.length > 0 && (
        <Card>
          <CardContent className="space-y-2 p-5">
            <h2 className="font-semibold">{t("admin.agentRuns.perAgent")}</h2>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {perAgent.map(([agent, stats]) => (
                <div key={agent} className="flex items-center justify-between rounded-lg border p-3">
                  <span className="font-mono text-sm">{agent}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">
                      {stats.runs} {t("admin.agentRuns.runs").toLowerCase()}
                    </Badge>
                    <Badge variant={stats.success === stats.runs ? "default" : "secondary"} className="text-[10px]">
                      {stats.success}/{stats.runs} {t("admin.agentRuns.success").toLowerCase()}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}