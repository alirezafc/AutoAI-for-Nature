"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/intl-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/input";

type VoiceConfig = {
  sttProvider: string;
  sttModel: string;
  llmProvider: string;
  llmModel: string;
  ttsProvider: string;
  ttsModel: string;
  voice: string;
  temperature: number;
  speed: number;
  greeting: string;
  systemPrompt: string;
  ragEnabled: boolean;
  saveConversations: boolean;
};

export default function VoicePage() {
  const { t } = useI18n();
  const [config, setConfig] = useState<VoiceConfig | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/admin/voice");
      const data = await res.json();
      if (data.config) setConfig(data.config);
    })();
  }, []);

  if (!config) return null;

  async function save() {
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

      <Card>
        <CardContent className="grid gap-4 p-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t("admin.voice.sttProvider")}</Label>
            <Input
              value={config.sttProvider}
              onChange={(e) => setConfig({ ...config, sttProvider: e.target.value })}
              placeholder="browser"
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("admin.voice.sttModel")}</Label>
            <Input value={config.sttModel} onChange={(e) => setConfig({ ...config, sttModel: e.target.value })} placeholder="web-speech" />
          </div>
          <div className="space-y-1.5">
            <Label>{t("admin.voice.llmProvider")}</Label>
            <Input value={config.llmProvider} onChange={(e) => setConfig({ ...config, llmProvider: e.target.value })} placeholder="mock" />
          </div>
          <div className="space-y-1.5">
            <Label>{t("admin.voice.llmModel")}</Label>
            <Input value={config.llmModel} onChange={(e) => setConfig({ ...config, llmModel: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("admin.voice.ttsProvider")}</Label>
            <Input value={config.ttsProvider} onChange={(e) => setConfig({ ...config, ttsProvider: e.target.value })} placeholder="browser" />
          </div>
          <div className="space-y-1.5">
            <Label>{t("admin.voice.ttsModel")}</Label>
            <Input value={config.ttsModel} onChange={(e) => setConfig({ ...config, ttsModel: e.target.value })} placeholder="web-speech" />
          </div>
          <div className="space-y-1.5">
            <Label>{t("admin.voice.voice")}</Label>
            <Input value={config.voice ?? ""} onChange={(e) => setConfig({ ...config, voice: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("admin.voice.speed")}</Label>
            <Input
              type="number"
              step="0.1"
              min="0.5"
              max="2"
              value={config.speed ?? 1}
              onChange={(e) => setConfig({ ...config, speed: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("admin.voice.greeting")}</Label>
            <Input value={config.greeting ?? ""} onChange={(e) => setConfig({ ...config, greeting: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("admin.voice.systemPrompt")}</Label>
            <Textarea
              value={config.systemPrompt ?? ""}
              onChange={(e) => setConfig({ ...config, systemPrompt: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 p-5">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={config.ragEnabled !== false}
              onChange={(e) => setConfig({ ...config, ragEnabled: e.target.checked })}
            />
            {t("admin.voice.ragEnabled")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={config.saveConversations !== false}
              onChange={(e) => setConfig({ ...config, saveConversations: e.target.checked })}
            />
            {t("admin.voice.saveConversations")}
          </label>
          <Button onClick={save} className="ml-auto">
            {t("common.save")}
          </Button>
          {saved && <span className="text-sm text-primary">{t("admin.voice.saved")}</span>}
        </CardContent>
      </Card>
    </div>
  );
}
