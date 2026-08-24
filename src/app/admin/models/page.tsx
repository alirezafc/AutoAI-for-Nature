"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/intl-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Select } from "@/components/ui/input";

type ModelConfig = {
  purpose: string;
  label: string;
  primaryProvider: string;
  primaryModel: string;
  fallbackProvider: string;
  fallbackModel: string;
  temperature: number;
  maxTokens: number;
  ragEnabled: boolean;
};

type Provider = { key: string; name: string; configured: boolean };

const PURPOSES = ["idea", "strategist", "researcher", "writer", "critic", "seo", "publisher", "final_critic", "lessons", "chat", "voice"];

export default function ModelsPage() {
  const { t } = useI18n();
  const [configs, setConfigs] = useState<Record<string, ModelConfig>>({});
  const [providers, setProviders] = useState<Provider[]>([]);
  const [modelsByProvider, setModelsByProvider] = useState<Record<string, string[]>>({});
  const [drafts, setDrafts] = useState<Record<string, Partial<ModelConfig>>>({});

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/admin/models");
      const data = await res.json();
      const map: Record<string, ModelConfig> = {};
      for (const c of data.configs ?? []) map[c.purpose] = c;
      setConfigs(map);
      setProviders(data.providers ?? []);
      const mbp: Record<string, string[]> = {};
      for (const p of data.catalog ?? []) {
        if (!mbp[p.provider]) mbp[p.provider] = [];
        mbp[p.provider].push(p.model);
      }
      setModelsByProvider(mbp);
    })();
  }, []);

  async function save(purpose: string) {
    const draft = drafts[purpose] ?? {};
    const res = await fetch("/api/admin/models", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ purpose, ...draft }),
    });
    if (res.ok) {
      const data = await res.json();
      setConfigs((prev) => ({ ...prev, [purpose]: data.config }));
      setDrafts((prev) => ({ ...prev, [purpose]: {} }));
    }
  }

  function set(purpose: string, key: keyof ModelConfig, value: unknown) {
    setDrafts((prev) => ({ ...prev, [purpose]: { ...prev[purpose], [key]: value } }));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight">{t("admin.models.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("admin.models.subtitle")}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {providers.map((p) => (
          <Badge key={p.key} variant={p.configured ? "default" : "outline"}>
            {p.name} · {p.configured ? t("common.connected") : t("common.notConfigured")}
          </Badge>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {PURPOSES.map((purpose) => {
          const c = configs[purpose];
          const d = drafts[purpose] ?? {};
          const primaryProvider = d.primaryProvider ?? c?.primaryProvider ?? "mock";
          const primaryModel = d.primaryModel ?? c?.primaryModel ?? "";
          return (
            <Card key={purpose}>
              <CardContent className="space-y-3 p-5">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold capitalize">{purpose.replace(/_/g, " ")}</h2>
                  <Badge variant="outline">{primaryProvider}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("admin.models.primaryProvider")}</Label>
                    <Select value={primaryProvider} onChange={(e) => set(purpose, "primaryProvider", e.target.value)}>
                      {providers.map((p) => (
                        <option key={p.key} value={p.key}>
                          {p.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("admin.models.primaryModel")}</Label>
                    <Select value={primaryModel} onChange={(e) => set(purpose, "primaryModel", e.target.value)}>
                      {(modelsByProvider[primaryProvider] ?? [primaryModel]).map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs">{t("admin.models.temperature")}</Label>
                    <Input
                      type="number"
                      className="w-20"
                      value={d.temperature ?? c?.temperature ?? 70}
                      onChange={(e) => set(purpose, "temperature", Number(e.target.value))}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs">{t("admin.models.maxTokens")}</Label>
                    <Input
                      type="number"
                      className="w-24"
                      value={d.maxTokens ?? c?.maxTokens ?? 2048}
                      onChange={(e) => set(purpose, "maxTokens", Number(e.target.value))}
                    />
                  </div>
                </div>
                <Button size="sm" onClick={() => save(purpose)}>
                  {t("common.save")}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
