"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Mic, Square } from "lucide-react";
import { useI18n } from "@/components/i18n/intl-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Phase = "idle" | "listening" | "thinking" | "speaking";

export default function VoicePage() {
  const { t, locale } = useI18n();
  const [phase, setPhase] = useState<Phase>("idle");
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState("");
  const [latency, setLatency] = useState<number | null>(null);
  const [error, setError] = useState("");
  const recRef = useRef<SpeechRecognition | null>(null);
  const phaseRef = useRef<Phase>("idle");
  const transcriptRef = useRef("");
  const synth = typeof window !== "undefined" ? window.speechSynthesis : null;

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  const speak = useCallback(
    (text: string, lang: string) => {
      if (!synth) return;
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = lang === "fa" ? "fa-IR" : "en-US";
      utter.onend = () => setPhase("idle");
      utter.onerror = () => setPhase("idle");
      setPhase("speaking");
      synth.cancel();
      synth.speak(utter);
    },
    [synth]
  );

  const stop = useCallback(() => {
    recRef.current?.stop();
    synth?.cancel();
    setPhase("idle");
  }, [synth]);

  const ask = useCallback(
    async (question: string) => {
      setPhase("thinking");
      const started = performance.now();
      try {
        const res = await fetch("/api/voice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: question, language: locale }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Voice request failed");
        setLatency(Math.round(performance.now() - started));
        setReply(data.text ?? "");
        speak(data.text ?? "", locale);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Voice request failed");
        setPhase("idle");
      }
    },
    [locale, speak]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = locale === "fa" ? "fa-IR" : "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (e) => {
      const text = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join("");
      setTranscript(text);
    };
    rec.onend = () => {
      if (phaseRef.current === "listening") {
        const finalTranscript = transcriptRef.current.trim();
        if (finalTranscript) ask(finalTranscript);
        else setPhase("idle");
      }
    };
    rec.onerror = () => setPhase("idle");
    recRef.current = rec;
  }, [locale, ask]);

  const supported = typeof window !== "undefined" && Boolean(window.SpeechRecognition ?? window.webkitSpeechRecognition);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-black tracking-tight">{t("voice.title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("voice.subtitle")}</p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center gap-6 p-8">
          <div className="flex flex-col items-center gap-4">
            <div
              className={`flex h-24 w-24 items-center justify-center rounded-full transition-all ${
                phase === "listening"
                  ? "bg-primary text-primary-foreground ring-8 ring-primary/20"
                  : phase === "speaking"
                    ? "bg-primary/80 text-primary-foreground"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {phase === "thinking" ? (
                <Loader2 className="h-8 w-8 animate-spin" />
              ) : phase === "listening" || phase === "speaking" ? (
                <Mic className="h-8 w-8" />
              ) : (
                <Mic className="h-8 w-8" />
              )}
            </div>
            {!supported && <p className="text-sm text-destructive">{t("voice.notSupported")}</p>}
            <div className="flex gap-3">
              {phase === "listening" ? (
                <Button onClick={stop} variant="destructive">
                  <Square className="h-4 w-4" /> {t("voice.stop")}
                </Button>
              ) : (
                <Button
                  onClick={() => {
                    setError("");
                    setTranscript("");
                    setPhase("listening");
                    recRef.current?.start();
                  }}
                  disabled={!supported || phase === "thinking" || phase === "speaking"}
                >
                  <Mic className="h-4 w-4" /> {t("voice.start")}
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{t("voice.tryExample")}</p>
          </div>

          {transcript && (
            <div className="w-full rounded-xl bg-muted/60 p-4 text-sm">
              <div className="mb-1 text-xs font-semibold text-muted-foreground uppercase">{t("voice.listening")}</div>
              {transcript}
            </div>
          )}

          {(reply || error) && (
            <div className="w-full space-y-2 rounded-xl border p-4 text-sm leading-relaxed">
              {error ? (
                <p className="text-destructive">{error}</p>
              ) : (
                <>
                  <p className="whitespace-pre-wrap">{reply}</p>
                  {latency !== null && (
                    <p className="text-xs text-muted-foreground">
                      {t("voice.latency")}: {(latency / 1000).toFixed(1)}s
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
