"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Bot, Loader2, User } from "lucide-react";
import { useI18n } from "@/components/i18n/intl-provider";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";

type Source = { id?: string; title?: string; type?: string; score?: number };

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  provider?: string | null;
  model?: string | null;
  latency?: number | null;
  tokensIn?: number | null;
  tokensOut?: number | null;
  createdAt: string;
};

type Conversation = {
  id: string;
  language: string;
  createdAt: string;
  provider?: string | null;
  model?: string | null;
  latency?: number | null;
  messages: Message[];
};

export default function ConversationDetailPage() {
  const params = useParams<{ id: string }>();
  const { t } = useI18n();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await fetch(`/api/chat?id=${params.id}`);
      if (!res.ok) {
        setError(t("common.runNotFound"));
        return;
      }
      const data = await res.json();
      if (alive) setConversation(data.conversation);
    })();
    return () => {
      alive = false;
    };
  }, [params.id]);

  if (error) {
    return <p className="text-destructive">{error}</p>;
  }

  if (!conversation) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
      </div>
    );
  }

  const msgCount = conversation.messages.filter((m) => m.role === "assistant").length;
  const withSources = conversation.messages.filter((m) => (m.sources?.length ?? 0) > 0).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/admin/conversations"
            className="mb-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> {t("admin.articles.back")}
          </Link>
          <h1 className="text-2xl font-black tracking-tight">
            {conversation.messages.find((m) => m.role === "user")?.content.slice(0, 60) ?? t("admin.system.noConversations")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {conversation.language === "fa" ? t("common.fa") : t("common.en")} · {formatDateTime(conversation.createdAt)}
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="secondary">{conversation.messages.length} {t("common.items")}</Badge>
          <Badge variant="outline">{withSources}/{msgCount} {t("chat.sourcesLabel")}</Badge>
        </div>
      </div>

      <div className="space-y-4">
        {conversation.messages.length === 0 && (
          <Card>
            <CardContent className="p-8 text-sm text-muted-foreground">{t("admin.system.noConversations")}</CardContent>
          </Card>
        )}
        {conversation.messages.map((m) => (
          <div key={m.id} className={`flex gap-3 ${m.role === "user" ? "justify-end" : ""}`}>
            <div
              className={`max-w-[80%] space-y-2 rounded-2xl border px-4 py-3 text-sm leading-relaxed ${
                m.role === "user" ? "bg-primary text-primary-foreground" : "bg-card"
              }`}
            >
              <div className="flex items-center gap-1.5 text-xs opacity-60">
                {m.role === "user" ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                <span className="font-semibold">{m.role === "user" ? t("common.user") : t("chat.title")}</span>
                <span>· {formatDateTime(m.createdAt)}</span>
              </div>
              <div className="whitespace-pre-wrap">{m.content || "…"}</div>

              {m.sources && m.sources.length > 0 && (
                <div className="space-y-1 border-t pt-2 text-xs opacity-80">
                  <div className="font-semibold">{t("chat.sourcesLabel")}</div>
                  {m.sources.map((s, si) => (
                    <div key={si} className="flex items-center justify-between gap-2">
                      <span>{s.title}</span>
                      {typeof s.score === "number" && (
                        <span className="font-mono tabular-nums opacity-70">
                          {Math.round(s.score * 100)}%
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {m.provider && (
                <div className={`text-[10px] opacity-50 ${m.role === "user" ? "text-primary-foreground" : ""}`}>
                  {m.provider}/{m.model} · {m.latency != null ? `${(m.latency / 1000).toFixed(1)}s` : ""}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}