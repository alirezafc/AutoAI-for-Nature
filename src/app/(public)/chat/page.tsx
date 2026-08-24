"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Sparkles, Trash2 } from "lucide-react";
import { useI18n } from "@/components/i18n/intl-provider";
import { Button } from "@/components/ui/button";

type Message = {
  role: "user" | "assistant";
  content: string;
  sources?: { title: string; url?: string; score?: number }[];
  hasRelevant?: boolean;
  provider?: string;
  model?: string;
  latencyMs?: number;
};

function scorePct(score: number): string {
  const pct = Math.round(score * 100);
  return `${pct}%`;
}

export default function ChatPage() {
  const { t, locale } = useI18n();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const conversationId = useRef<string | undefined>(undefined);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  async function send(text: string) {
    if (!text.trim() || thinking) return;
    setMessages((m) => [...m, { role: "user", content: text }]);
    setInput("");
    setThinking(true);
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: text, language: locale, conversationId: conversationId.current }),
    });
    if (!res.ok || !res.body) {
      setMessages((m) => [...m, { role: "assistant", content: t("chat.providerError") }]);
      setThinking(false);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let acc = "";
    setMessages((m) => [...m, { role: "assistant", content: "" }]);
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunkStr = decoder.decode(value, { stream: true });
        for (const line of chunkStr.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const payload = JSON.parse(line.slice(6));
          if (payload.type === "chunk") {
            acc += payload.text;
            setMessages((m) => {
              const copy = [...m];
              const last = copy[copy.length - 1];
              copy[copy.length - 1] = { ...last, content: acc };
              return copy;
            });
          } else if (payload.type === "done") {
            conversationId.current = payload.conversationId ?? conversationId.current;
            setMessages((m) => {
              const copy = [...m];
              const last = copy[copy.length - 1];
              copy[copy.length - 1] = {
                ...last,
                content: payload.text ?? acc,
                sources: payload.sources,
                hasRelevant: payload.hasRelevant,
                provider: payload.provider,
                model: payload.model,
                latencyMs: payload.latencyMs,
              };
              return copy;
            });
          } else if (payload.type === "error") {
            setMessages((m) => {
              const copy = [...m];
              const last = copy[copy.length - 1];
              copy[copy.length - 1] = { ...last, content: payload.error ?? t("common.genericError") };
              return copy;
            });
          }
        }
      }
    } catch {
      // stream aborted
    } finally {
      setThinking(false);
    }
  }

  function clear() {
    if (conversationId.current) fetch(`/api/chat?id=${conversationId.current}`, { method: "DELETE" }).catch(() => {});
    conversationId.current = undefined;
    setMessages([]);
  }

  const suggestions = [t("chat.suggestion1"), t("chat.suggestion2"), t("chat.suggestion3")];

  return (
    <div className="mx-auto flex min-h-[calc(100vh-7rem)] w-full max-w-3xl flex-col px-4 py-8">
      <div className="mb-6 text-center">
        <h1 className="text-3xl font-black tracking-tight">{t("chat.title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("chat.subtitle")}</p>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto">
        {messages.length === 0 && (
          <div className="space-y-3 py-8">
            <div className="rounded-2xl border bg-card p-4 text-sm text-muted-foreground">
              <Sparkles className="mb-2 h-4 w-4 text-primary" />
              {t("chat.welcome")}
            </div>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border bg-background px-3 py-1.5 text-sm transition-colors hover:bg-accent"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] space-y-2 rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                m.role === "user" ? "bg-primary text-primary-foreground" : "border bg-card"
              }`}
            >
              <div className="whitespace-pre-wrap">{m.content || "…"}</div>
              {m.sources && m.sources.length > 0 && (
                <div className={`space-y-1 border-t pt-2 ${m.role === "user" ? "border-primary-foreground/20" : ""}`}>
                  <div className="text-xs font-semibold opacity-70">{t("chat.sourcesLabel")}</div>
                  {m.sources.map((s, si) => (
                    <div key={si} className="flex items-center justify-between gap-2 text-xs opacity-90">
                      <span>{s.title}</span>
                      {typeof s.score === "number" && (
                        <span className="font-mono tabular-nums opacity-70">{scorePct(s.score)}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {m.hasRelevant === false && (
                <div className={`border-t pt-1.5 text-xs opacity-70 ${m.role === "user" ? "border-primary-foreground/20" : ""}`}>
                  {t("chat.noRelevantKnowledge")}
                </div>
              )}
              {m.provider && (
                <div className={`text-[10px] opacity-50 ${m.role === "user" ? "text-primary-foreground" : ""}`}>
                  {m.provider}/{m.model} · {m.latencyMs ? `${(m.latencyMs / 1000).toFixed(1)}s` : ""}
                </div>
              )}
            </div>
          </div>
        ))}
        {thinking && (
          <div className="flex justify-start">
            <div className="rounded-2xl border bg-card px-4 py-3 text-sm text-muted-foreground">
              {t("chat.thinking")}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="sticky bottom-0 mt-6 flex items-center gap-2 rounded-2xl border bg-background p-2 shadow-sm">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder={t("chat.placeholder")}
          className="flex-1 bg-transparent px-3 py-2 text-sm focus:outline-none"
        />
        <Button
          size="icon"
          onClick={() => send(input)}
          disabled={thinking || !input.trim()}
          aria-label={t("chat.send")}
        >
          <Send className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" onClick={clear} aria-label={t("chat.clear")}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
