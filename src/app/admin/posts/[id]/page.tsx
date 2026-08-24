"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, AlertTriangle, Bot, CheckCircle2, Clock, Edit3, Eye, History, Loader2,
  Pencil, RefreshCw, Save, Sparkles, ThumbsDown, Trash2, X,
} from "lucide-react";
import { useI18n } from "@/components/i18n/intl-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Markdown } from "@/components/markdown";
import { formatDateTime, timeAgo } from "@/lib/utils";

type Step = {
  id: string;
  agent: string;
  status: string;
  provider?: string | null;
  model?: string | null;
  revision: number;
  durationMs?: number | null;
  score?: number | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  inputSummary: string;
  outputSummary: string;
  error?: string | null;
};

type Run = {
  id: string;
  status: string;
  topic: string;
  language: string;
  runType: string;
  createdAt: string;
  durationMs?: number | null;
  steps: Step[];
};

type Revision = {
  id: string;
  version: number;
  label: string;
  actor: string;
  reason: string | null;
  createdAt: string;
};

type Post = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  language: string;
  status: string;
  coverImage: string;
  isAiGenerated: boolean;
  categoryId: string | null;
  category: { id: string; slug: string; nameEn: string; nameFa: string } | null;
  seo: { metaTitle?: string; metaDescription?: string; keywords?: string[] };
  tags: string[];
  authorName: string;
  agentRunId: string | null;
  reviewReason: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type Category = { id: string; slug: string; nameEn: string; nameFa: string };

export default function ArticleReviewWorkspace() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { t, locale } = useI18n();
  const [post, setPost] = useState<Post | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState<"preview" | "edit" | "history">("preview");
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [approving, setApproving] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  // edit form
  const [form, setForm] = useState<{
    title: string;
    excerpt: string;
    content: string;
    slug: string;
    language: string;
    categoryId: string;
    coverImage: string;
    tags: string;
    metaTitle: string;
    metaDescription: string;
    keywords: string;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [postRes, revRes, catRes] = await Promise.all([
      fetch(`/api/admin/posts/${params.id}`),
      fetch(`/api/admin/review?postId=${params.id}`),
      fetch("/api/admin/categories"),
    ]);
    const [postData, revData, catData] = await Promise.all([
      postRes.json().catch(() => ({ post: null })),
      revRes.json().catch(() => ({ revisions: [] })),
      catRes.json().catch(() => ({ categories: [] })),
    ]);
    if (!postData.post) {
      setError("Article not found");
      setLoading(false);
      return;
    }
    setPost(postData.post);
    setRun(postData.run);
    setRevisions(revData.revisions ?? []);
    setCategories(catData.categories ?? []);
    setForm({
      title: postData.post.title,
      excerpt: postData.post.excerpt ?? "",
      content: postData.post.content ?? "",
      slug: postData.post.slug ?? "",
      language: postData.post.language ?? "en",
      categoryId: postData.post.categoryId ?? "",
      coverImage: postData.post.coverImage ?? "",
      tags: (postData.post.tags ?? []).join(", "),
      metaTitle: postData.post.seo?.metaTitle ?? "",
      metaDescription: postData.post.seo?.metaDescription ?? "",
      keywords: (postData.post.seo?.keywords ?? []).join(", "),
    });
    setError("");
    setLoading(false);
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  const lang = post?.language === "fa" ? "fa" : "en";
  const dir = lang === "fa" ? "rtl" : "ltr";

  const stepScores = useMemo(() => {
    if (!run) return { critic: null as number | null, seo: null as number | null, finalCritic: null as number | null, overall: null as number | null };
    const critic = run.steps.filter((s) => s.agent === "critic" && s.score != null).at(-1)?.score ?? null;
    const seo = run.steps.find((s) => s.agent === "seo")?.score ?? null;
    const finalCritic = run.steps.find((s) => s.agent === "final_critic")?.score ?? null;
    const overall = finalCritic ?? critic;
    return { critic, seo, finalCritic, overall };
  }, [run]);

  async function save() {
    if (!post || !form) return;
    setSaving(true);
    setSavedMsg("");
    const res = await fetch("/api/admin/posts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: post.id,
        title: form.title,
        excerpt: form.excerpt,
        content: form.content,
        slug: form.slug,
        language: form.language,
        categoryId: form.categoryId || null,
        coverImage: form.coverImage,
        tags: form.tags.split(",").map((s) => s.trim()).filter(Boolean),
        seo: {
          metaTitle: form.metaTitle,
          metaDescription: form.metaDescription,
          keywords: form.keywords.split(",").map((s) => s.trim()).filter(Boolean),
        },
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (res.ok) {
      setSavedMsg("Saved successfully");
      setPost(data.post ?? post);
      load();
      setTimeout(() => setSavedMsg(""), 3000);
    } else {
      setError(data.error ?? "Save failed");
    }
  }

  async function approve() {
    if (!post) return;
    setApproving(true);
    const res = await fetch("/api/admin/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId: post.id, action: "approve" }),
    });
    const data = await res.json().catch(() => ({}));
    setApproving(false);
    setPublishOpen(false);
    if (res.ok) {
      load();
    } else {
      setError(data.error ?? "Publish failed");
    }
  }

  async function reject() {
    if (!post || !rejectReason.trim()) return;
    setRejecting(true);
    const res = await fetch("/api/admin/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId: post.id, action: "reject", reason: rejectReason }),
    });
    const data = await res.json().catch(() => ({}));
    setRejecting(false);
    setRejectOpen(false);
    if (res.ok) {
      load();
    } else {
      setError(data.error ?? "Reject failed");
    }
  }

  async function regenerate() {
    if (!post) return;
    setRegenerating(true);
    const res = await fetch("/api/admin/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId: post.id, action: "regenerate", language: post.language }),
    });
    const data = await res.json().catch(() => ({}));
    setRegenerating(false);
    if (res.ok && data?.newRunId) {
      load();
    } else {
      setError(data.error ?? "Regenerate failed");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
      </div>
    );
  }

  if (!post) {
    return (
      <div className="space-y-4">
        <p className="text-destructive">{error || "Article not found"}</p>
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/posts">
            <ArrowLeft className="h-4 w-4" /> {t("article.backToBlog")}
          </Link>
        </Button>
      </div>
    );
  }

  const statusLabel: Record<string, string> = {
    published: t("common.published"),
    needs_review: t("common.needsReview"),
    draft: t("common.draft"),
    rejected: t("common.rejected"),
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2">
            <Link
              href="/admin/posts"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> {t("admin.articles.title")}
            </Link>
            {run && (
              <Link
                href={`/admin/runs/${run.id}`}
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <Bot className="h-4 w-4" /> {t("article.viewRun")}
              </Link>
            )}
          </div>
          <h1 className="text-2xl font-black tracking-tight">{post.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant={post.status === "published" ? "default" : post.status === "rejected" ? "destructive" : post.status === "needs_review" ? "secondary" : "outline"}>
              {statusLabel[post.status] ?? post.status}
            </Badge>
            <span>{lang === "fa" ? t("common.fa") : t("common.en")}</span>
            <span>·</span>
            <span>{post.category ? (lang === "fa" ? post.category.nameFa : post.category.nameEn) : t("common.unknown")}</span>
            <span>·</span>
            <span>{formatDateTime(post.createdAt)}</span>
            {post.agentRunId && (
              <>
                <span>·</span>
                <span className="font-mono text-xs">{post.agentRunId.slice(0, 8)}</span>
              </>
            )}
          </div>
          {stepScores.overall != null && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="default" className="gap-1">
                <Sparkles className="h-3 w-3" /> {Math.round(stepScores.overall)}% {t("admin.agentRuns.qualityScore")}
              </Badge>
              {stepScores.critic != null && (
                <Badge variant="outline" className="gap-1">
                  <Clock className="h-3 w-3" /> Critic {Math.round(stepScores.critic)}%
                </Badge>
              )}
              {stepScores.seo != null && (
                <Badge variant="outline" className="gap-1">
                  <Sparkles className="h-3 w-3" /> SEO {Math.round(stepScores.seo)}%
                </Badge>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={view === "preview" ? "default" : "outline"} onClick={() => setView("preview")}>
            <Eye className="h-4 w-4" /> {t("admin.articleDetail.editContent")}
          </Button>
          <Button size="sm" variant={view === "edit" ? "default" : "outline"} onClick={() => setView("edit")}>
            <Pencil className="h-4 w-4" /> {t("common.edit")}
          </Button>
          <Button size="sm" variant={view === "history" ? "default" : "outline"} onClick={() => setView("history")}>
            <History className="h-4 w-4" /> {t("common.history")}
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Review actions */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
        <span className="mr-auto text-xs font-semibold uppercase text-muted-foreground">
          {post.status === "needs_review" ? t("admin.agentRuns.waitingHuman") : t("admin.articles.title")}
        </span>
        {post.status !== "published" && (
          <Button size="sm" onClick={() => setPublishOpen(true)} disabled={approving}>
            <CheckCircle2 className="h-4 w-4" /> {t("common.publish")}
          </Button>
        )}
        {post.status !== "rejected" && (
          <Button size="sm" variant="destructive" onClick={() => setRejectOpen(true)} disabled={rejecting}>
            <ThumbsDown className="h-4 w-4" /> {t("common.reject")}
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={regenerate} disabled={regenerating}>
          <RefreshCw className={`h-4 w-4 ${regenerating ? "animate-spin" : ""}`} /> {t("admin.overview.latestRuns")}
        </Button>
      </div>

      {/* Content */}
      {view === "preview" && (
        <div className="rounded-lg border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <span className="text-xs font-bold uppercase tracking-wide text-amber-600">Preview — Not Published</span>
            {post.status === "needs_review" && <Badge variant="secondary">Review</Badge>}
          </div>
          <div dir={dir} className="p-6">
            {post.coverImage && (
              <div className="mb-6 overflow-hidden rounded-xl">
                <img src={post.coverImage} alt={post.title} className="h-64 w-full object-cover" />
              </div>
            )}
            <div className="mx-auto max-w-3xl space-y-6">
              {post.category && (
                <Badge variant="outline" className="text-primary">
                  {lang === "fa" ? post.category.nameFa : post.category.nameEn}
                </Badge>
              )}
              <h1 className="text-3xl font-black leading-tight tracking-tight md:text-4xl">{post.title}</h1>
              {post.excerpt && <p className="text-lg text-muted-foreground">{post.excerpt}</p>}
              <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                <span>
                  {formatDateTime(post.publishedAt) || formatDateTime(post.createdAt)} · {post.authorName}
                </span>
                {post.isAiGenerated && (
                  <span className="flex items-center gap-1.5">
                    <Bot className="h-4 w-4" /> {t("article.aiGenerated")}
                  </span>
                )}
              </div>
              <div className="border-t pt-6">
                <Markdown content={post.content} />
              </div>
            </div>
          </div>
        </div>
      )}

      {view === "history" && (
        <Card>
          <CardContent className="space-y-4 p-5">
            <h2 className="text-lg font-bold">{t("common.history")}</h2>
            {post.reviewReason && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">
                <span className="font-semibold">{t("common.reason")}: </span>
                {post.reviewReason}
              </div>
            )}
            {revisions.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("common.emptyState")}</p>
            ) : (
              <div className="space-y-2">
                {/* AI generated is always version 1 */}
                <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3">
                  <div>
                    <div className="font-medium">
                      v1 · {post.isAiGenerated ? t("common.aiGenerated") : t("common.draft")}
                    </div>
                    <div className="text-xs text-muted-foreground">{t("article.aiGenerated")} · AutoAI for Nature</div>
                  </div>
                  <Badge variant="outline">{formatDateTime(post.createdAt)}</Badge>
                </div>
                {revisions.map((r) => (
                  <div key={r.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <div className="font-medium">
                        v{r.version + 1} · {r.label}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {r.actor} · {formatDateTime(r.createdAt)}
                      </div>
                      {r.reason && <div className="mt-1 text-xs text-muted-foreground">Reason: {r.reason}</div>}
                    </div>
                    <Badge variant="outline">{timeAgo(r.createdAt)}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Run summary for preview */}
      {view === "preview" && run && run.steps.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Agent pipeline</h2>
              <Link href={`/admin/runs/${run.id}`} className="text-sm text-primary hover:underline">
                {t("common.view")}
              </Link>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {run.steps.map((s, i) => (
                <span key={s.id} className="flex items-center gap-1.5">
                  <span
                    className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
                      s.status === "completed"
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : s.status === "failed"
                          ? "border-destructive/40 bg-destructive/10 text-destructive"
                          : s.status === "running"
                            ? "border-amber-400/40 bg-amber-400/10 text-amber-600"
                            : "border-border text-muted-foreground"
                    }`}
                  >
                    {s.agent}
                    {s.score != null && <span className="ml-1">{Math.round(s.score)}%</span>}
                  </span>
                  {i < run.steps.length - 1 && <span className="text-muted-foreground">→</span>}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Edit view */}
      {view === "edit" && form && (
        <Card>
          <CardContent className="space-y-4 p-5">
            <h2 className="text-lg font-bold">{t("admin.articleDetail.editContent")}</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("common.title")}</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t("common.type")}</Label>
                <Select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                  <option value="">—</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {form.language === "fa" ? cat.nameFa : cat.nameEn}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("common.language")}</Label>
                <Select value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })}>
                  <option value="en">{t("common.en")}</option>
                  <option value="fa">{t("common.fa")}</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Slug</Label>
                <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>{t("common.description")}</Label>
                <Textarea value={form.excerpt} onChange={(e) => setForm({ ...form, excerpt: e.target.value })} className="min-h-[70px]" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Cover image URL</Label>
                <Input value={form.coverImage} onChange={(e) => setForm({ ...form, coverImage: e.target.value })} placeholder="https://..." />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Tags</Label>
                <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="forests, ecology" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>{t("admin.articleDetail.metaTitle")}</Label>
                <Input value={form.metaTitle} onChange={(e) => setForm({ ...form, metaTitle: e.target.value })} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>{t("admin.articleDetail.metaDescription")}</Label>
                <Textarea value={form.metaDescription} onChange={(e) => setForm({ ...form, metaDescription: e.target.value })} className="min-h-[60px]" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>{t("admin.articleDetail.keywords")}</Label>
                <Input value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} placeholder="seo, article, nature" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>{t("common.content")}</Label>
                <Textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} className="min-h-[300px] font-mono text-xs" />
              </div>
            </div>
            {savedMsg && <p className="text-sm text-emerald-600">{savedMsg}</p>}
            <div className="flex gap-2">
              <Button onClick={save} disabled={saving}>
                <Save className="h-4 w-4" /> {saving ? t("common.saving") : t("common.save")}
              </Button>
              <Button variant="outline" onClick={() => setView("preview")}>
                <Eye className="h-4 w-4" /> Preview
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Publish confirmation */}
      {publishOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border bg-card p-6">
            <h2 className="text-lg font-bold">Publish this article?</h2>
            <p className="mt-2 text-sm text-muted-foreground">This will make the article publicly visible.</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPublishOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button onClick={approve} disabled={approving}>
                {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} {t("common.publish")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Reject modal */}
      {rejectOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border bg-card p-6">
            <h2 className="text-lg font-bold">{t("common.reject")}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{t("admin.lessons.reason")}</p>
            <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} className="mt-3 min-h-[100px]" />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRejectOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button variant="destructive" onClick={reject} disabled={rejecting || !rejectReason.trim()}>
                {rejecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ThumbsDown className="h-4 w-4" />} {t("common.reject")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}