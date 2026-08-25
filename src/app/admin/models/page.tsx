"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/intl-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Select } from "@/components/ui/input";
import { Loader2, RefreshCw } from "lucide-react";

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

/** Static registry entry (non-OpenRouter providers). */
type CatalogSummary = {
  provider: string;
  providerName: string;
  models: { id: string; name: string; free: boolean }[];
};

/** Sanitized live OpenRouter catalog entry served by our admin API. */
type CatalogModel = {
  id: string;
  name: string;
  contextLength?: number | null;
  free: boolean;
  pricing: { promptPerMillion: number | null; completionPerMillion: number | null };
  supportedParameters: string[];
  supportsStructuredOutputs: boolean;
};

const PURPOSES = ["idea", "strategist", "researcher", "writer", "critic", "seo", "publisher", "final_critic", "lessons", "chat", "voice"];

export default function ModelsPage() {
  const { t } = useI18n();
  const [configs, setConfigs] = useState<Record<string, ModelConfig>>({});
  const [providers, setProviders] = useState<Provider[]>([]);
  const [staticModelsByProvider, setStaticModelsByProvider] = useState<Record<string, { id: string; name: string; free: boolean }[]>>({});
  const [openrouterModels, setOpenrouterModels] = useState<CatalogModel[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState("");
  const [catalogFetchedAt, setCatalogFetchedAt] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Partial<ModelConfig>>>({});

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/admin/models");
      const data = await res.json();
      const map: Record<string, ModelConfig> = {};
      for (const c of data.configs ?? []) map[c.purpose] = c;
      setConfigs(map);
      setProviders(data.providers ?? []);
      // Catalog summaries carry a MODELS ARRAY per provider (provider -> models[]).
      const mbp: Record<string, { id: string; name: string; free: boolean }[]> = {};
      for (const p of (data.catalog ?? []) as CatalogSummary[]) {
        mbp[p.provider] = (p.models ?? []).map((m) => ({ id: m.id, name: m.name, free: Boolean(m.free) }));
      }
      setStaticModelsByProvider(mbp);
    })();
  }, []);

  async function loadCatalog(refresh: boolean) {
    setCatalogLoading(true);
    setCatalogError("");
    try {
      const res = await fetch(`/api/admin/models/catalog${refresh ? "?refresh=1" : ""}`);
      const data = await res.json();
      if (!res.ok) {
        setCatalogError(data.error ?? "Failed");
        return;
      }
      setOpenrouterModels(data.models ?? []);
      setCatalogFetchedAt(data.fetchedAt ?? "");
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : "Failed");
    } finally {
      setCatalogLoading(false);
    }
  }

  useEffect(() => {
    void loadCatalog(false);
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

  /** Change provider: swap to that provider's model list and reset the model choice. */
  function setProvider(purpose: string, provider: string) {
    setDrafts((prev) => ({ ...prev, [purpose]: { ...prev[purpose], primaryProvider: provider, primaryModel: "" } }));
  }

  function modelOptions(provider: string): { id: string; name: string; free?: boolean; structured?: boolean }[] {
    if (provider === "openrouter") {
      return openrouterModels.map((m) => ({
        id: m.id,
        name: m.name,
        free: m.free,
        structured: m.supportsStructuredOutputs,
      }));
    }
    return staticModelsByProvider[provider] ?? [];
  }

  function formatOptionLabel(m: { id: string; name: string; free?: boolean; structured?: boolean }): string {
    const parts = [m.name !== m.id ? `${m.name} (${m.id})` : m.id];
    if (m.free) parts.push(t("admin.models.free"));
    if (m.structured) parts.push("JSON");
    return parts.join(" · ");
  }

  const fmtPrice = (v: number | null | undefined) =>
    v === null || v === undefined
      ? "—"
      : v === 0
        ? t("admin.models.free")
        : `$${v < 0.01 ? v.toFixed(4) : v.toFixed(2)} / M`;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight">{t("admin.models.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("admin.models.subtitle")}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => loadCatalog(true)} disabled={catalogLoading}>
          {catalogLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {catalogLoading ? t("admin.models.refreshing") : t("admin.models.refreshModels")}
        </Button>
      </div>

      {catalogError && (
        <p className="text-sm text-destructive">
          {t("admin.models.catalogError")}: {catalogError}
        </p>
      )}
      {!catalogError && openrouterModels.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("admin.models.catalogUpdated")}: {new Date(catalogFetchedAt).toLocaleString()} · {openrouterModels.length} {t("admin.models.modelsCount")}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {providers.map((p) => (
          <Badge key={p.key} variant={p.configured ? "default" : "outline"}>
            {p.name} · {p.configured ? t("common.connected") : t("common.notConfigured")}
            {p.key === "openrouter" && openrouterModels.length > 0 ? ` · ${openrouterModels.length} ${t("admin.models.modelsCount")}` : ""}
          </Badge>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {PURPOSES.map((purpose) => {
          const c = configs[purpose];
          const d = drafts[purpose] ?? {};
          const primaryProvider = d.primaryProvider ?? c?.primaryProvider ?? "mock";
          // Keep the persisted selection visible even before/if the live catalog loads.
          const primaryModel = d.primaryModel ?? c?.primaryModel ?? "";
          const options = modelOptions(primaryProvider);
          const known = options.some((m) => m.id === primaryModel);
          const selectedLive = openrouterModels.find((m) => m.id === primaryModel);
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
                    <Select value={primaryProvider} onChange={(e) => setProvider(purpose, e.target.value)}>
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
                      {!known && primaryModel && (
                        <option key={primaryModel} value={primaryModel}>
                          {primaryModel}
                        </option>
                      )}
                      {options.map((m) => (
                        <option key={m.id} value={m.id}>
                          {formatOptionLabel(m)}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>

                {primaryProvider === "openrouter" && selectedLive && (
                  <div className="rounded-md border bg-muted/30 p-2.5 text-xs text-muted-foreground">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-medium text-foreground">{selectedLive.id}</span>
                      <Badge variant={selectedLive.free ? "default" : "outline"}>
                        {selectedLive.free ? t("admin.models.free") : t("admin.models.paid")}
                      </Badge>
                      {selectedLive.supportsStructuredOutputs && <Badge variant="secondary">JSON schema</Badge>}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
                      <span>
                        {t("admin.models.contextLength")}:{" "}
                        {selectedLive.contextLength ? selectedLive.contextLength.toLocaleString() : "—"}
                      </span>
                      <span>
                        {t("admin.models.priceIn")}: {fmtPrice(selectedLive.pricing.promptPerMillion)}
                      </span>
                      <span>
                        {t("admin.models.priceOut")}: {fmtPrice(selectedLive.pricing.completionPerMillion)}
                      </span>
                    </div>
                  </div>
                )}

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
