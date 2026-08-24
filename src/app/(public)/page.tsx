import Link from "next/link";
import { ArrowRight, Bot, BookOpen, Brain, Database, MessageSquare, Mic, ShieldCheck, Sparkles, Workflow } from "lucide-react";
import { getServerI18n, type ServerI18n } from "@/lib/i18n/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listPublishedPosts } from "@/lib/services/posts";
import { listCategories } from "@/lib/services/categories";
import { getVectorStats } from "@/lib/rag";
import { countAgentRuns } from "@/lib/services/agent-runs";
import { configuredProviderCount } from "@/lib/ai/registry";
import { formatDate, estimateReadingMinutes } from "@/lib/utils";

export default async function HomePage() {
  const { t } = await getServerI18n();
  const [posts, categories, vectorStats, runs] = await Promise.all([
    listPublishedPosts({ limit: 6 }),
    listCategories(),
    getVectorStats().catch(() => ({ documents: 0, chunks: 0 })),
    countAgentRuns().catch(() => ({ total: 0, succeeded: 0, failed: 0, avgDurationMs: 0 })),
  ]);
  const liveAi = configuredProviderCount() > 0;

  const totalPosts = posts.length > 0 ? runs.total : 0;
  const stats = [
    { value: totalPosts, label: t("home.statsArticles") },
    { value: runs.total, label: t("home.statsRuns") },
    { value: vectorStats.documents, label: t("home.statsKnowledge") },
    { value: vectorStats.chunks, label: t("home.statsChunks") },
  ];

  return (
    <HomeView posts={posts} categories={categories} vectorStats={vectorStats} runs={runs} liveAi={liveAi} stats={stats} t={t} />
  );
}

function HomeView({
  posts,
  categories,
  runs,
  liveAi,
  stats,
  t,
}: {
  posts: Awaited<ReturnType<typeof listPublishedPosts>>;
  categories: Awaited<ReturnType<typeof listCategories>>;
  vectorStats: { documents: number; chunks: number };
  runs: { total: number; succeeded: number; failed: number; avgDurationMs: number };
  liveAi: boolean;
  stats: { value: number; label: string }[];
  t: ServerI18n["t"];
}) {

  const pipeline = [
    { icon: Sparkles, title: t("home.pipeline1Title"), desc: t("home.pipeline1Desc") },
    { icon: Bot, title: t("home.pipeline2Title"), desc: t("home.pipeline2Desc") },
    { icon: Workflow, title: t("home.pipeline3Title"), desc: t("home.pipeline3Desc") },
    { icon: ShieldCheck, title: t("home.pipeline4Title"), desc: t("home.pipeline4Desc") },
  ];

  return (
    <div className="space-y-20 pb-20">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-accent/60 via-background to-background" />
        <div className="container grid items-center gap-10 py-16 lg:grid-cols-2 lg:py-24">
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="gap-1.5">
                <Sparkles className="h-3 w-3" />
                {t("home.heroKicker")}
              </Badge>
              <Badge
                variant={liveAi ? "default" : "outline"}
                className={`gap-1.5 ${liveAi ? "" : "border-dashed"}`}
                title={liveAi ? t("home.liveTitle") : t("home.demoTitle")}
              >
                <Brain className="h-3 w-3" />
                {liveAi ? t("home.liveBadge") : t("home.demoBadge")}
              </Badge>
            </div>
            <h1 className="text-4xl font-black leading-tight tracking-tight md:text-5xl">
              {t("home.heroTitle")}
            </h1>
            <p className="max-w-xl text-lg text-muted-foreground">{t("home.heroSubtitle")}</p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/blog">
                  {t("home.ctaRead")} <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/chat">
                  <MessageSquare className="h-4 w-4" /> {t("home.ctaChat")}
                </Link>
              </Button>
              <Button asChild variant="ghost" size="lg">
                <Link href="/voice">
                  <Mic className="h-4 w-4" /> {t("home.ctaVoice")}
                </Link>
              </Button>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {posts.slice(0, 4).map((p, i) => (
              <Link key={p.id} href={`/blog/${p.slug}`} className={i % 2 === 0 ? "sm:mt-6" : ""}>
                <Card className="h-full transition-shadow hover:shadow-md">
                  <CardContent className="flex h-full flex-col gap-2 p-5">
                    <Badge variant="outline" className="w-fit text-primary">
                      {p.category?.nameEn ?? "AutoAI"}
                    </Badge>
                    <h3 className="line-clamp-3 font-semibold leading-snug">{p.title}</h3>
                    <span className="mt-auto text-xs text-muted-foreground">
                      {p.publishedAt ? formatDate(p.publishedAt) : ""} · {estimateReadingMinutes(p.content)} min
                    </span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="container">
        <h2 className="mb-6 text-center text-2xl font-black tracking-tight">{t("home.statsTitle")}</h2>
        <div className="grid gap-4 rounded-2xl border bg-card p-6 text-center sm:grid-cols-4">
          {stats.map((s, i) => (
            <div key={i}>
              <div className="text-3xl font-black text-primary">{s.value.toLocaleString()}</div>
              <div className="text-sm text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>
        {liveAi ? (
          <p className="mt-3 text-center text-xs text-muted-foreground">
            <span className="font-semibold text-emerald-600">{t("home.liveNoticeTitle")}</span>{" "}
            {t("home.liveNotice")}
          </p>
        ) : (
          <p className="mt-3 text-center text-xs text-muted-foreground">
            <span className="font-semibold text-amber-600">{t("home.demoNoticeTitle")}</span>{" "}
            {t("home.demoNotice")}
          </p>
        )}
      </section>

      {/* Pipeline */}
      <section className="container">
        <div className="mb-8 text-center">
          <h2 className="text-3xl font-black tracking-tight">{t("home.aiTitle")}</h2>
          <p className="mt-2 text-muted-foreground">{t("home.aiSubtitle")}</p>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          {pipeline.map((step, i) => (
            <Card key={step.title} className="relative">
              <CardContent className="space-y-3 p-6">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <step.icon className="h-4 w-4" />
                  </span>
                  <span className="text-xs font-bold text-muted-foreground">0{i + 1}</span>
                </div>
                <h3 className="font-semibold">{step.title}</h3>
                <p className="text-sm text-muted-foreground">{step.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
        {runs.total > 0 && (
          <div className="mt-6 flex justify-center gap-6 text-center text-xs text-muted-foreground">
            <span>
              <Database className="mr-1 inline h-3.5 w-3.5" />
              {runs.total} {t("home.statsRuns")}
            </span>
            <span>
              ✓ {runs.succeeded} {t("home.statsSucceeded")}
            </span>
            <span>
              ✗ {runs.failed} {t("home.statsFailed")}
            </span>
          </div>
        )}
        <div className="mt-6 text-center">
          <Button asChild variant="outline">
            <Link href="/admin/runs">
              {t("home.viewPipeline")} <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      {/* Latest articles */}
      <section className="container">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h2 className="text-3xl font-black tracking-tight">{t("blog.title")}</h2>
            <p className="mt-2 text-muted-foreground">{t("blog.subtitle")}</p>
          </div>
          <Button asChild variant="ghost">
            <Link href="/blog">
              {t("common.view")} <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {posts.map((p) => (
            <Link key={p.id} href={`/blog/${p.slug}`} className="group">
              <Card className="h-full overflow-hidden transition-shadow group-hover:shadow-md">
                <div className="flex h-40 items-center justify-center bg-gradient-to-br from-primary/15 via-accent to-background">
                  <BookOpen className="h-10 w-10 text-primary/50" />
                </div>
                <CardContent className="space-y-2 p-5">
                  <Badge variant="outline" className="text-primary">
                    {p.category?.nameEn ?? "AutoAI"}
                  </Badge>
                  <h3 className="line-clamp-2 font-semibold leading-snug group-hover:text-primary">
                    {p.title}
                  </h3>
                  <p className="line-clamp-2 text-sm text-muted-foreground">{p.excerpt}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{p.publishedAt ? formatDate(p.publishedAt) : ""}</span>
                    <span>·</span>
                    <span>{estimateReadingMinutes(p.content)} min</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* Categories */}
      <section className="container">
        <h2 className="mb-6 text-2xl font-black tracking-tight">{t("nav.categories")}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((cat) => (
            <Link key={cat.id} href={`/categories/${cat.slug}`}>
              <Card className="flex items-center gap-3 p-4 transition-shadow hover:shadow-md">
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: cat.color }}
                />
                <div>
                  <div className="font-semibold">{cat.nameEn}</div>
                  <div className="text-xs text-muted-foreground">{cat.descriptionEn}</div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}