"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/intl-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { Loader2, PlugZap, RefreshCw, Gauge } from "lucide-react";

type ProviderInfo = {
  key: string;
  name: string;
  configured: boolean;
  hasKey: boolean;
  source: "stored" | "env" | "none";
  env: string | null;
  models: { id: string; name: string; free: boolean }[];
};

type TestResult = { provider: string; name: string; ok: boolean; configured: boolean; status?: number; latencyMs?: number; error?: string };

type DeepCall = { ok: boolean; model: string | null; latencyMs?: number; dimensions?: number; error?: string };
type DeepTestResult = { provider: string; name: string; configured: boolean; chat: DeepCall | null; embedding: DeepCall | null };

export default function SettingsPage() {
  const { t } = useI18n();
  const [settings, setSettings] = useState<any>(null);
  const [saved, setSaved] = useState(false);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [embeddingModels, setEmbeddingModels] = useState<{ id: string; name: string }[]>([]);
  const [defaults, setDefaults] = useState({ provider: "mock", model: "autoai-demo-1", embeddingProvider: "mock", embeddingModel: "autoai-demo-1" });
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});
  const [savingConn, setSavingConn] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [deepTests, setDeepTests] = useState<DeepTestResult[]>([]);
  const [deepTesting, setDeepTesting] = useState(false);
  const [connStatus, setConnStatus] = useState("");

  useEffect(() => {
    (async () => {
      const [res, connRes] = await Promise.all([fetch("/api/admin/settings"), fetch("/api/admin/connections")]);
      const data = await res.json();
      setSettings(data.settings ?? {});
      const conn = await connRes.json().catch(() => null);
      if (conn) {
        setProviders(conn.providers ?? []);
        setEmbeddingModels(conn.embeddingModels ?? []);
        setDefaults(conn.defaults ?? defaults);
      }
    })();
  }, []);

  if (!settings) return null;

  async function save() {
    const res = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        "rag.sources": settings["rag.sources"],
        "rag.embedding": settings["rag.embedding"],
        "rag.chunking": settings["rag.chunking"],
        "rag.search": settings["rag.search"],
        "agent.revision": settings["agent.revision"],
      }),
    });
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }

  const sources = settings["rag.sources"] ?? {};
  const embedding = settings["rag.embedding"] ?? {};
  const chunking = settings["rag.chunking"] ?? {};
  const search = settings["rag.search"] ?? {};
  const revision = settings["agent.revision"] ?? {};

  async function saveConnections(test: boolean) {
    test ? setSavingConn(true) : setRefreshing(true);
    setConnStatus("");
    setTestResults([]);
    setDeepTests([]);
    try {
      const res = await fetch("/api/admin/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keys: keyInputs,
          defaultProvider: defaults.provider,
          defaultModel: defaults.model,
          embeddingProvider: defaults.embeddingProvider,
          embeddingModel: defaults.embeddingModel,
          test,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setConnStatus(data.error ?? "Failed");
        return;
      }
      if (data.testResults) setTestResults(data.testResults);
      setConnStatus(test ? t("admin.connections.savedAndTested") : t("admin.connections.reconnected"));
      const connRes = await fetch("/api/admin/connections");
      const conn = await connRes.json();
      if (conn) {
        setProviders(conn.providers ?? []);
        setEmbeddingModels(conn.embeddingModels ?? []);
        setDefaults(conn.defaults ?? defaults);
      }
    } catch (err) {
      setConnStatus(err instanceof Error ? err.message : "Failed");
    } finally {
      setSavingConn(false);
      setRefreshing(false);
    }
  }

  async function runDeepTest() {
    setDeepTesting(true);
    setConnStatus("");
    setDeepTests([]);
    try {
      const res = await fetch("/api/admin/connections?deep=1");
      const data = await res.json();
      setDeepTests(data.deepTests ?? []);
      if (!res.ok) setConnStatus(data.error ?? "Failed");
    } catch (err) {
      setConnStatus(err instanceof Error ? err.message : "Failed");
    } finally {
      setDeepTesting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight">{t("admin.system.settingsTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("admin.rag.subtitle")}</p>
        </div>
        <Button onClick={save}>
          {t("common.save")}
        </Button>
      </div>
      {saved && <p className="text-sm text-primary">{t("admin.rag.saved")}</p>}

      <Card className="border-primary/30">
        <CardContent className="space-y-4 p-5">
          <div className="flex items-center gap-2">
            <PlugZap className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">{t("admin.connections.title")}</h2>
          </div>
          <p className="text-sm text-muted-foreground">{t("admin.connections.subtitle")}</p>

          <div className="flex flex-wrap gap-2">
            {providers.map((p) => (
              <span
                key={p.key}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
                  p.configured ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${p.configured ? "bg-primary" : "bg-muted-foreground"}`} />
                {p.name}
                {p.configured ? ` · ${t("common.connected")}` : ` · ${t("common.notConfigured")}`}
                {p.source === "stored" && " · DB"}
              </span>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {providers.map((p) => (
              <div key={p.key} className="space-y-1.5">
                <Label>
                  {p.name}
                  {p.hasKey ? ` (${t("admin.connections.keySet")})` : ""}
                </Label>
                <Input
                  type="password"
                  autoComplete="off"
                  placeholder={p.hasKey ? `•••••••• (${t("admin.connections.keySet")})` : p.env ? `${p.env}` : ""}
                  value={keyInputs[p.env ?? ""] ?? ""}
                  onChange={(e) => setKeyInputs({ ...keyInputs, [p.env ?? ""]: e.target.value })}
                />
              </div>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("admin.connections.defaultProvider")}</Label>
              <Select value={defaults.provider} onChange={(e) => setDefaults({ ...defaults, provider: e.target.value })}>
                <option value="mock">Mock (demo)</option>
                {providers.map((p) => (
                  <option key={p.key} value={p.key}>{p.name}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("admin.connections.defaultModel")}</Label>
              <Select value={defaults.model} onChange={(e) => setDefaults({ ...defaults, model: e.target.value })}>
                <option value="autoai-demo-1">autoai-demo-1</option>
                {(providers.find((p) => p.key === defaults.provider)?.models ?? []).map((m) => (
                  <option key={m.id} value={m.id}>{m.name}{m.free ? " (free)" : ""}</option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("admin.connections.embeddingProvider")}</Label>
              <Select value={defaults.embeddingProvider} onChange={(e) => setDefaults({ ...defaults, embeddingProvider: e.target.value })}>
                <option value="mock">Mock (demo)</option>
                {providers.map((p) => (
                  <option key={p.key} value={p.key}>{p.name}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("admin.connections.embeddingModel")}</Label>
              <Select value={defaults.embeddingModel} onChange={(e) => setDefaults({ ...defaults, embeddingModel: e.target.value })}>
                <option value="autoai-demo-1">autoai-demo-1</option>
                {embeddingModels.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => saveConnections(true)} disabled={savingConn}>
              {savingConn ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
              {t("admin.connections.saveAndTest")}
            </Button>
            <Button variant="outline" onClick={() => saveConnections(false)} disabled={refreshing}>
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {t("admin.connections.reconnect")}
            </Button>
            <Button variant="outline" onClick={runDeepTest} disabled={deepTesting}>
              {deepTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gauge className="h-4 w-4" />}
              {t("admin.connections.deepTest")}
            </Button>
          </div>

          {connStatus && <p className="text-sm text-primary">{connStatus}</p>}

          {testResults.length > 0 && (
            <div className="space-y-1.5">
              {testResults.map((r) => (
                <div key={r.provider} className="flex items-center gap-2 text-sm">
                  <span className={`h-2 w-2 rounded-full ${r.ok ? "bg-emerald-500" : "bg-destructive"}`} />
                  <span className="font-medium">{r.name}</span>
                  <span className="text-muted-foreground">
                    {r.ok
                      ? r.status
                        ? `${t("admin.connections.ok")} (${r.status}, ${r.latencyMs ?? "?"}ms)`
                        : `${t("admin.connections.ok")}`
                      : `${r.error ?? t("admin.connections.failed")}`}
                  </span>
                </div>
              ))}
            </div>
          )}

          {deepTests.length > 0 && (
            <div className="space-y-2 rounded-md border p-3">
              <p className="text-xs font-semibold text-muted-foreground">{t("admin.connections.deepTestTitle")}</p>
              {deepTests.map((d) => (
                <div key={d.provider} className="space-y-1 text-sm">
                  <div className="flex items-center gap-2 font-medium">{d.name}</div>
                  <div className="grid gap-1 pl-4 text-xs text-muted-foreground">
                    {d.chat ? (
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${d.chat.ok ? "bg-emerald-500" : "bg-destructive"}`} />
                        {t("admin.connections.chat")}: {d.chat.model ?? "—"}
                        {d.chat.ok
                          ? ` · ${t("common.ok")} (${d.chat.latencyMs ?? "?"}ms)`
                          : ` · ${d.chat.error ?? t("admin.connections.failed")}`}
                      </div>
                    ) : (
                      <div className="text-muted-foreground/70">{t("admin.connections.chat")}: —</div>
                    )}
                    {d.embedding ? (
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${d.embedding.ok ? "bg-emerald-500" : "bg-destructive"}`} />
                        {t("admin.connections.embedding")}: {d.embedding.model ?? "—"}
                        {d.embedding.dimensions != null ? ` · ${d.embedding.dimensions} dims` : ""}
                        {d.embedding.ok
                          ? ` · ${t("common.ok")} (${d.embedding.latencyMs ?? "?"}ms)`
                          : ` · ${d.embedding.error ?? t("admin.connections.failed")}`}
                      </div>
                    ) : (
                      <div className="text-muted-foreground/70">{t("admin.connections.embedding")}: —</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-5">
          <h2 className="font-semibold">{t("admin.rag.title")}</h2>
          <div className="space-y-2">
            <Label>{t("admin.rag.publishedArticles")}</Label>
            <input
              type="checkbox"
              className="ml-2"
              checked={sources.publishedArticles !== false}
              onChange={(e) => setSettings({ ...settings, "rag.sources": { ...sources, publishedArticles: e.target.checked } })}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("admin.rag.curatedKnowledge")}</Label>
            <input
              type="checkbox"
              className="ml-2"
              checked={sources.curatedKnowledge !== false}
              onChange={(e) => setSettings({ ...settings, "rag.sources": { ...sources, curatedKnowledge: e.target.checked } })}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("admin.rag.draftArticles")}</Label>
            <input
              type="checkbox"
              className="ml-2"
              checked={Boolean(sources.draftArticles)}
              onChange={(e) => setSettings({ ...settings, "rag.sources": { ...sources, draftArticles: e.target.checked } })}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("admin.rag.embeddingProvider")}</Label>
              <Input
                value={embedding.provider ?? ""}
                onChange={(e) => setSettings({ ...settings, "rag.embedding": { ...embedding, provider: e.target.value } })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("admin.rag.embeddingModel")}</Label>
              <Input
                value={embedding.model ?? ""}
                onChange={(e) => setSettings({ ...settings, "rag.embedding": { ...embedding, model: e.target.value } })}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("admin.rag.chunkSize")}</Label>
              <Input
                type="number"
                value={chunking.chunkSize ?? 900}
                onChange={(e) => setSettings({ ...settings, "rag.chunking": { ...chunking, chunkSize: Number(e.target.value) } })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("admin.rag.chunkOverlap")}</Label>
              <Input
                type="number"
                value={chunking.chunkOverlap ?? 120}
                onChange={(e) => setSettings({ ...settings, "rag.chunking": { ...chunking, chunkOverlap: Number(e.target.value) } })}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("admin.rag.topK")}</Label>
            <Input
              type="number"
              className="w-32"
              value={search.topK ?? 4}
              onChange={(e) => setSettings({ ...settings, "rag.search": { ...search, topK: Number(e.target.value) } })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-5">
          <h2 className="font-semibold">{t("admin.revision.title") ?? "Agent revision"}</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>{t("admin.revision.maxRounds") ?? "Max revision rounds"}</Label>
              <Input
                type="number"
                value={revision.maxRounds ?? 2}
                onChange={(e) => setSettings({ ...settings, "agent.revision": { ...revision, maxRounds: Number(e.target.value) } })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("admin.revision.threshold") ?? "Quality threshold (%)"}</Label>
              <Input
                type="number"
                value={revision.threshold ?? 80}
                onChange={(e) => setSettings({ ...settings, "agent.revision": { ...revision, threshold: Number(e.target.value) } })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("admin.revision.onMax") ?? "When max rounds reached"}</Label>
              <Input
                value={revision.onMaxReached ?? "needs_review"}
                onChange={(e) => setSettings({ ...settings, "agent.revision": { ...revision, onMaxReached: e.target.value } })}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
