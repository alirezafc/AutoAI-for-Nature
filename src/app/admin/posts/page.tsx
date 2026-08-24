"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Search, Trash2 } from "lucide-react";
import { useI18n } from "@/components/i18n/intl-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/input";
import { formatDateTime } from "@/lib/utils";

type Post = {
  id: string;
  title: string;
  excerpt: string;
  language: string;
  status: string;
  createdAt: string;
  category: { nameEn: string; nameFa: string } | null;
  isAiGenerated: boolean;
};

const STATUS_OPTIONS = [
  { value: "published", label: "published" },
  { value: "needs_review", label: "needsReview" },
  { value: "draft", label: "draft" },
  { value: "rejected", label: "rejected" },
];

export default function PostsPage() {
  const { t } = useI18n();
  const [posts, setPosts] = useState<Post[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (status) params.set("status", status);
    const res = await fetch(`/api/admin/posts?${params}`);
    const data = await res.json();
    setPosts(data.posts ?? []);
  }, [search, status]);

  useEffect(() => {
    const id = setTimeout(load, 200);
    return () => clearTimeout(id);
  }, [load]);

  async function remove(id: string) {
    if (!confirm(t("common.cancelConfirm"))) return;
    await fetch(`/api/admin/posts?id=${id}`, { method: "DELETE" });
    load();
  }

  async function setStatusOf(id: string, next: string) {
    await fetch("/api/admin/posts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: next }),
    });
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight">{t("admin.articles.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("admin.articles.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild size="sm">
            <Link href="/admin">
              <Plus className="h-4 w-4" /> {t("admin.articles.generate")}
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/admin/runs">{t("admin.agentRuns.newRun")}</Link>
          </Button>
        </div>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("common.search")}
            className="pl-9"
          />
        </div>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-44">
          <option value="">{t("common.all")}</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {t(`common.${s.label}`)}
            </option>
          ))}
        </Select>
      </div>

      {posts.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">{t("common.noResults")}</CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">{t("admin.articles.columnTitle")}</th>
                <th className="hidden px-4 py-2 font-medium md:table-cell">{t("common.status")}</th>
                <th className="hidden px-4 py-2 font-medium md:table-cell">{t("common.language")}</th>
                <th className="hidden px-4 py-2 font-medium lg:table-cell">{t("common.created")}</th>
                <th className="px-4 py-2 text-right font-medium">{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((p) => (
                <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/posts/${p.id}`}
                      className="font-medium transition-colors hover:text-primary"
                      title={`Review ${p.title}`}
                    >
                      {p.title}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {p.category?.nameEn ?? "—"} {p.isAiGenerated ? "· AI" : ""}
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    <Badge
                      variant={
                        p.status === "published"
                          ? "default"
                          : p.status === "needs_review"
                            ? "secondary"
                            : p.status === "rejected"
                              ? "destructive"
                              : "outline"
                      }
                    >
                      {t(`common.${p.status === "needs_review" ? "needsReview" : p.status}`)}
                    </Badge>
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">{p.language === "fa" ? t("common.fa") : t("common.en")}</td>
                  <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">
                    {formatDateTime(p.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1.5">
                      {p.status === "needs_review" && (
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/admin/posts/${p.id}`}>{t("admin.agentRuns.waitingHuman")}</Link>
                        </Button>
                      )}
                      {p.status !== "published" && (
                        <Button size="sm" variant="ghost" onClick={() => setStatusOf(p.id, "published")}>
                          {t("common.publish")}
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => remove(p.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
