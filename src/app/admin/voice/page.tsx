"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/intl-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Mic, Volume2 } from "lucide-react";

/** Only the fields the V1 voice implementation actually consumes. */
type VoiceSettings = {
  ragEnabled: boolean;
  systemPrompt: string;
  temperature: number;
};

type VoiceStatus = {
  stt: string;
  tts: string;
  languages: ("en" | "fa")[];
  conversationSaving: boolean;
};

export default function VoicePage() {
  const { t } = useI18n();
  const [config, setConfig] = useState<VoiceSettings | null>(null);
  const [engine, setEngine] = useState<{ provider: string; model: string }>({ provider: "", model: "" });
  const [status, setStatus] = useState<VoiceStatus | null>(null);
  const [saved, setSaved] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/voice");
        const data = await res.json();
        if (!res.ok) {
          setLoadError(data.error ?? t("common.error"));
          return;
        }
        setConfig(data.config);
        setStatus(data.status ?? null);
        setEngine(data.engine ?? { provider: "", model: "" });
      } catch {
        setLoadError(t("common.error"));
      }
    })();
  }, [t]);

  async function save() {
    if (!config) return;
    const res = await fetch("/api/admin/voice", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight">{t("admin.voice.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("admin.voice.subtitle")}</p>
      </div>

      {loadError && <p className="text-sm text-destructive">{loadError}</p>}

      {/* Real capability status — browser Web Speech API + live LLM engine */}
      <Card>
        <CardContent className="space-y-3 p-5">
          <h2 className="font-semibold">{t("admin.voice.statusTitle")}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border p-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Mic className="h-4 w-4 text-primary" /> {t("admin.voice.sttLabel")}
              </div>
              <Badge variant="secondary" className="mt-2">
                {t("admin.voice.browserWebSpeech")}
              </Badge>
            </div>
            <div className="rounded-lg border p-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Volume2 className="h-4 w-4 text-primary" /> {t("admin.voice.ttsLabel")}
              </div>
              <Badge variant="secondary" className="mt-2">
                {t("admin.voice.browserWebSpeech")}
              </Badge>
            </div>
            <div className="rounded-lg border p-3 text-sm">
              <div className="font-medium">{t("admin.voice.llmEngine")}</div>
              <div className="mt-1 text-muted-foreground">
                {engine.provider ? `${engine.provider} / ${engine.model}` : t("admin.voice.llmEngineUnset")}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{t("admin.voice.llmEngineHint")}</p>
            </div>
            <div className="rounded-lg border p-3 text-sm">
              <div className="font-medium">{t("admin.voice.languagesLabel")}</div>
              <div className="mt-1 flex gap-2">
                {(status?.languages ?? ["en", "fa"]).map((l) => (
                  <Badge key={l} variant="outline">
                    {l === "fa" ? "فارسی" : "English"}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Real configurable surface */}
      {!config ? (
        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">{t("common.loading")}</CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="space-y-4 p-5">
            <h2 className="font-semibold">{t("admin.voice.settingsTitle")}</h2>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={config.ragEnabled}
                onChange={(e) => setConfig({ ...config, ragEnabled: e.target.checked })}
              />
              {t("admin.voice.ragEnabled")}
            </label>
            <div className="space-y-1.5">
              <Label>{t("admin.voice.systemPrompt")}</Label>
              <Textarea
                rows={4}
                value={config.systemPrompt}
                onChange={(e) => setConfig({ ...config, systemPrompt: e.target.value })}
                placeholder={t("admin.voice.systemPromptPlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("admin.voice.temperature")}</Label>
              <Input
                type="number"
                min="0"
                max="100"
                value={config.temperature}
                onChange={(e) => setConfig({ ...config, temperature: Number(e.target.value) })}
              />
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={save}>{t("common.save")}</Button>
              {saved && <span className="text-sm text-primary">{t("admin.voice.saved")}</span>}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
