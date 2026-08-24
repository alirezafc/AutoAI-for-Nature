"use client";

import { useEffect, useState } from "react";
import { Cable, Check, Copy, Plus, Terminal, Trash2 } from "lucide-react";
import { useI18n } from "@/components/i18n/intl-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/input";
import { formatDateTime } from "@/lib/utils";

type Tool = { name: string; description: string; invocationsCount: number; lastInvokedAt?: string | null };
type Host = { id: string; name: string; type: string; endpoint?: string | null; status: string };

function CopyButton({ text, label, copiedLabel }: { text: string; label: string; copiedLabel: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <Button size="sm" variant="outline" onClick={copy} className="shrink-0">
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? copiedLabel : label}
    </Button>
  );
}

function CodeBlock({ code }: { code: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs leading-relaxed">{code}</pre>
  );
}

const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3200";
const endpointUrl = `${origin}/api/mcp`;
const jsonSnippet = `{
  "mcpServers": {
    "autoai-nature": {
      "type": "http",
      "url": "${endpointUrl}",
      "headers": { "Authorization": "Bearer dev-mcp-secret" }
    }
  }
}`;
const curlSnippet = `curl -X POST "${endpointUrl}" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer dev-mcp-secret" \\
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'`;
const stdioSnippet = `# run the local stdio server
npm run mcp

# add to Claude Desktop config:
{
  "mcpServers": {
    "autoai-nature": {
      "command": "npx",
      "args": ["tsx", "scripts/mcp-stdio.ts"]
    }
  }
}`;
const testSnippet = `curl -X POST "${endpointUrl}" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer dev-mcp-secret" \\
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'`;

export default function McpPage() {
  const { t } = useI18n();
  const [tools, setTools] = useState<Tool[]>([]);
  const [hosts, setHosts] = useState<Host[]>([]);
  const [name, setName] = useState("");
  const [endpoint, setEndpoint] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const res = await fetch("/api/admin/mcp");
    const data = await res.json();
    setTools(data.tools ?? []);
    setHosts(data.hosts ?? []);
  }

  async function addHost() {
    if (!name.trim()) return;
    await fetch("/api/admin/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), type: "custom", endpoint: endpoint.trim() || undefined }),
    });
    setName("");
    setEndpoint("");
    load();
  }

  async function removeHost(id: string) {
    if (!confirm(t("common.cancelConfirm"))) return;
    await fetch(`/api/admin/mcp?id=${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight">{t("admin.mcp.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("admin.mcp.subtitle")}</p>
      </div>

      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex items-center gap-2">
            <Cable className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">{t("admin.mcp.hostsTitle")}</h2>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("common.name")} className="flex-1" />
            <Input
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder={t("admin.mcp.endpointLabel")}
              className="flex-1"
            />
            <Button onClick={addHost}>
              <Plus className="h-4 w-4" /> {t("admin.mcp.addHost")}
            </Button>
          </div>
          {hosts.length > 0 && (
            <div className="space-y-2 pt-2">
              {hosts.map((h) => (
                <div key={h.id} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
                  <div>
                    <div className="font-medium">{h.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {h.type}
                      {h.endpoint && <> · {h.endpoint}</>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{h.status}</Badge>
                    <Button size="sm" variant="ghost" onClick={() => removeHost(h.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">{t("admin.mcp.guideTitle")}</h2>
          </div>
          <p className="text-sm text-muted-foreground">{t("admin.mcp.guideStep1")}</p>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{t("admin.mcp.guideStep2")} (Claude Desktop / Cursor)</span>
              <CopyButton text={jsonSnippet} label={t("admin.mcp.guideStep6")} copiedLabel={t("admin.mcp.guideStep7")} />
            </div>
            <CodeBlock code={jsonSnippet} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{t("admin.mcp.guideStep3")}</span>
              <CopyButton text={curlSnippet} label={t("admin.mcp.guideStep6")} copiedLabel={t("admin.mcp.guideStep7")} />
            </div>
            <CodeBlock code={curlSnippet} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{t("admin.mcp.guideStep4")}</span>
              <CopyButton text={stdioSnippet} label={t("admin.mcp.guideStep6")} copiedLabel={t("admin.mcp.guideStep7")} />
            </div>
            <CodeBlock code={stdioSnippet} />
            <p className="text-xs text-muted-foreground">{t("admin.mcp.guideStep5")}</p>
          </div>

          <div className="space-y-2 rounded-lg border border-dashed p-3">
            <span className="text-sm font-medium">{t("admin.mcp.guideTestTitle")}</span>
            <CodeBlock code={testSnippet} />
            <p className="text-xs text-muted-foreground">{t("admin.mcp.guideTestDesc")}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <Cable className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">{t("admin.mcp.toolsTitle")}</h2>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {tools.map((tool) => (
              <div key={tool.name} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0">
                  <div className="font-mono text-xs font-semibold">{tool.name}</div>
                  <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{tool.description}</div>
                </div>
                <Badge variant="outline" className="shrink-0">
                  {tool.invocationsCount}
                </Badge>
              </div>
            ))}
          </div>
          {tools.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("admin.mcp.noInvocations")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
