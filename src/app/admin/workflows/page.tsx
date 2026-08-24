"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Play, RefreshCw, Workflow, XCircle } from "lucide-react";
import { useI18n } from "@/components/i18n/intl-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, timeAgo, formatDuration } from "@/lib/utils";

type Workflow = {
  id: string;
  key: string;
  name: string;
  description: string;
  schedule: string;
  enabled: boolean;
  lastRunAt?: string | null;
};

type WorkflowRun = {
  id: string;
  workflowId: string;
  status: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  durationMs?: number | null;
  error?: string | null;
  result?: Record<string, unknown> | null;
};

export default function WorkflowsPage() {
  const { t } = useI18n();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 4000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refresh() {
    const res = await fetch("/api/admin/workflows");
    const data = await res.json();
    setWorkflows(data.workflows ?? []);
    setRuns(data.runs ?? []);
  }

  async function run(w: Workflow) {
    setBusy(w.id);
    setError("");
    const res = await fetch("/api/admin/workflows?action=run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: w.key }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError(data.error ?? t("common.genericError"));
    setBusy(null);
    refresh();
  }

  async function toggleEnabled(w: Workflow) {
    await fetch("/api/admin/workflows", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: w.id, enabled: !w.enabled }),
    });
    refresh();
  }

  const anyRunning = runs.some((r) => r.status === "running") || busy !== null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight">{t("admin.automation.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("admin.automation.subtitle")}</p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {workflows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-muted-foreground">
            <Workflow className="h-8 w-8" />
            <span className="text-sm">{t("common.emptyState")}</span>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {workflows.map((w) => (
            <Card key={w.id} className={anyRunning && busy === w.id ? "ring-2 ring-primary/40" : ""}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-medium">
                    {w.name}
                    <Badge variant="outline">{w.key}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {w.description}
                    {w.lastRunAt && <> · {t("admin.automation.lastRun")}: {timeAgo(w.lastRunAt)}</>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {busy === w.id && (
                    <span className="flex items-center gap-1.5 text-xs font-medium text-amber-600">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("admin.agentRuns.running")}
                    </span>
                  )}
                  <Badge variant={w.enabled ? "default" : "secondary"}>
                    {w.enabled ? t("common.enabled") : t("common.disabled")}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{w.schedule}</span>
                  <Button size="sm" variant="ghost" onClick={() => toggleEnabled(w)}>
                    {t("common.toggle") ?? (w.enabled ? "Disable" : "Enable")}
                  </Button>
                  <Button size="sm" onClick={() => run(w)} disabled={busy !== null}>
                    {busy === w.id ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                    {t("common.run")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{t("admin.automation.runHistory")}</h2>
            <Button size="sm" variant="ghost" onClick={refresh}>
              <RefreshCw className={`h-4 w-4 ${anyRunning ? "animate-spin" : ""}`} />
            </Button>
          </div>
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("common.emptyState")}</p>
          ) : (
            <div className="space-y-2">
              {runs.map((r) => {
                const wf = workflows.find((w) => w.id === r.workflowId);
                const running = r.status === "running";
                return (
                  <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                    <div className="flex items-center gap-2.5">
                      {running ? (
                        <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
                      ) : r.status === "success" ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-destructive" />
                      )}
                      <div>
                        <div className="text-sm font-medium">{wf?.name ?? r.workflowId}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatDateTime(r.startedAt)}
                          {r.durationMs != null && <> · {formatDuration(r.durationMs)}</>}
                        </div>
                        {r.error && <div className="text-xs text-destructive">{r.error}</div>}
                      </div>
                    </div>
                    <Badge variant={running ? "secondary" : r.status === "success" ? "default" : "destructive"}>
                      {running ? t("admin.agentRuns.running") : r.status}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}