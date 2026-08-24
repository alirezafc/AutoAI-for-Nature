"use client";

import { useCallback, useEffect, useState } from "react";
import { Database, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useI18n } from "@/components/i18n/intl-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { formatDateTime } from "@/lib/utils";

type Doc = {
  id: string;
  title: string;
  content?: string;
  language: string;
  author?: string;
  sourceType: string;
  status: string;
  indexedAt?: string | null;
  chunkCount?: number | null;
  createdAt: string;
};

export default function KnowledgePage() {
  const { t } = useI18n();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Doc | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [language, setLanguage] = useState<"en" | "fa">("en");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/knowledge");
    const data = await res.json();
    setDocs(data.documents ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function resetForm() {
    setTitle("");
    setContent("");
    setLanguage("en");
    setCreating(false);
    setEditing(null);
  }

  function startEdit(d: Doc) {
    setEditing(d);
    setTitle(d.title);
    setContent(d.content ?? "");
    setLanguage(d.language === "fa" ? "fa" : "en");
    setCreating(false);
  }

  async function save() {
    if (!title.trim() || !content.trim()) return;
    setBusy(true);
    if (editing) {
      await fetch("/api/admin/knowledge", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editing.id, title, content, language }),
      });
    } else {
      await fetch("/api/admin/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content, language, sourceType: "curated", index: true }),
      });
    }
    setBusy(false);
    resetForm();
    load();
  }

  async function remove(id: string) {
    if (!confirm(t("common.cancelConfirm"))) return;
    await fetch(`/api/admin/knowledge?id=${id}`, { method: "DELETE" });
    load();
  }

  async function toggleStatus(d: Doc) {
    await fetch("/api/admin/knowledge", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: d.id, status: d.status === "active" ? "inactive" : "active" }),
    });
    load();
  }

  async function reindex(id: string) {
    const res = await fetch(`/api/admin/knowledge/${id}/reindex`, { method: "POST" });
    const data = await res.json().catch(() => null);
    load();
    if (data?.error) alert(data.error);
  }

  const [reindexingAll, setReindexingAll] = useState(false);
  const [reindexReport, setReindexReport] = useState<null | {
    embedding: { provider: string; model: string; dimensions: number | null };
    documents: number;
    succeeded: number;
    failed: number;
    vectors: number;
    results: { id: string; title: string; ok: boolean; chunks: number; error?: string }[];
  }>(null);

  async function reindexAll() {
    if (!confirm(t("admin.knowledge.reindexAllConfirm"))) return;
    setReindexingAll(true);
    setReindexReport(null);
    try {
      const res = await fetch("/api/admin/knowledge/reindex-all", { method: "POST" });
      const data = (await res.json()) ?? {};
      if (!res.ok) {
        alert(data.error ?? t("common.genericError"));
      } else {
        setReindexReport(data);
      }
    } catch {
      alert(t("common.genericError"));
    } finally {
      setReindexingAll(false);
      load();
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight">{t("admin.knowledge.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("admin.knowledge.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={reindexAll} disabled={reindexingAll}>
            <RefreshCw className={`h-4 w-4 ${reindexingAll ? "animate-spin" : ""}`} />
            {reindexingAll ? t("admin.knowledge.reindexingAll") : t("admin.knowledge.reindexAll")}
          </Button>
          <Button size="sm" onClick={() => { resetForm(); setCreating(true); }}>
            <Plus className="h-4 w-4" /> {t("admin.knowledge.createTitle")}
          </Button>
        </div>
      </div>

      {reindexReport && (
        <Card className={reindexReport.failed === 0 ? "border-primary/30" : "border-destructive/40"}>
          <CardContent className="space-y-2 p-5 text-sm">
            <div className="flex items-center justify-between font-medium">
              <span>
                {reindexReport.failed === 0
                  ? t("admin.knowledge.reindexDone")
                  : t("admin.knowledge.reindexFailed", { failed: String(reindexReport.failed) })}
              </span>
              <Badge variant={reindexReport.failed === 0 ? "default" : "destructive"}>
                {reindexReport.succeeded}/{reindexReport.documents} {t("admin.knowledge.docsReindexed")}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("admin.knowledge.embeddingUsed")}: {reindexReport.embedding.provider}/{reindexReport.embedding.model}
              {reindexReport.embedding.dimensions != null ? ` · ${reindexReport.embedding.dimensions} dims` : ""} ·{" "}
              {reindexReport.vectors} {t("common.chunks")}
            </p>
            {reindexReport.failed > 0 && (
              <ul className="list-inside list-disc text-xs text-destructive">
                {reindexReport.results.filter((r) => !r.ok).map((r) => (
                  <li key={r.id}>{r.title}: {r.error}</li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {(creating || editing) && (
        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{editing ? t("common.edit") : t("admin.knowledge.createTitle")}</h2>
              <Button size="sm" variant="ghost" onClick={resetForm}>
                {t("common.cancel")}
              </Button>
            </div>
            <div className="space-y-2">
              <Label>{t("common.name")}</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t("common.description")}</Label>
              <Textarea value={content} onChange={(e) => setContent(e.target.value)} className="min-h-[140px]" />
            </div>
            <div className="space-y-2">
              <Label>{t("admin.knowledge.documentLanguage")}</Label>
              <Select value={language} onChange={(e) => setLanguage(e.target.value as "en" | "fa")}>
                <option value="en">{t("common.en")}</option>
                <option value="fa">{t("common.fa")}</option>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={save} disabled={busy}>
                {busy ? t("common.saving") : editing ? t("common.save") : t("admin.knowledge.saveDoc")}
              </Button>
              {editing && (
                <span className="text-xs text-muted-foreground">
                  {t("admin.knowledge.reindexOnSave")}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {docs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-muted-foreground">
            <Database className="h-8 w-8" />
            <span className="text-sm">{t("admin.knowledge.noDocs")}</span>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {docs.map((d) => (
            <Card key={d.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-medium">
                    {d.title}
                    <Badge variant="outline">{d.sourceType}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {d.language === "fa" ? t("common.fa") : t("common.en")} · {d.author} · {formatDateTime(d.createdAt)}
                    {d.chunkCount != null && (
                      <span> · {d.chunkCount} {t("common.chunks")}{d.indexedAt ? "" : ` · ${t("common.notIndexed")}`}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge variant={d.status === "active" ? "default" : "secondary"} className={d.status === "active" && !d.indexedAt ? "border-amber-400/50 text-amber-600" : ""}>
                    {d.status === "active" ? t("common.active") : t("common.inactive")}
                  </Badge>
                  <Button size="sm" variant="ghost" onClick={() => startEdit(d)} aria-label={t("common.edit")}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => reindex(d.id)} title={t("admin.knowledge.reindex")}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => toggleStatus(d)}>
                    {d.status === "active" ? t("common.deactivate") : t("common.activate")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(d.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}