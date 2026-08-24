"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageSquare, Trash2, ChevronRight } from "lucide-react";
import { useI18n } from "@/components/i18n/intl-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils";

type Conversation = {
  id: string;
  language: string;
  createdAt: string;
  preview: string;
  messageCount: number;
};

export default function ConversationsPage() {
  const { t } = useI18n();
  const [convs, setConvs] = useState<Conversation[]>([]);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/chat");
      const data = await res.json();
      setConvs(data.conversations ?? []);
    })();
  }, []);

  async function remove(id: string) {
    if (!confirm(t("common.cancelConfirm"))) return;
    await fetch(`/api/chat?id=${id}`, { method: "DELETE" });
    setConvs((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight">{t("admin.system.conversationsTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("admin.system.conversationsSubtitle")}</p>
      </div>

      {convs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-muted-foreground">
            <MessageSquare className="h-8 w-8" />
            <span className="text-sm">{t("admin.system.noConversations")}</span>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {convs.map((c) => (
            <Card key={c.id} className="transition-shadow hover:shadow-sm">
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <Link href={`/admin/conversations/${c.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="min-w-0">
                    <div className="line-clamp-1 font-medium">{c.preview || "—"}</div>
                    <div className="text-xs text-muted-foreground">
                      {c.language === "fa" ? t("common.fa") : t("common.en")} · {c.messageCount} {t("common.items")} ·{" "}
                      {formatDateTime(c.createdAt)}
                    </div>
                  </div>
                </Link>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" asChild>
                    <Link href={`/admin/conversations/${c.id}`} aria-label={t("common.view")}>
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(c.id)}>
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
