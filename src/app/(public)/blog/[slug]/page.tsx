import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen, Bot, Clock } from "lucide-react";
import { getPostBySlug, relatedPosts } from "@/lib/services/posts";
import { getServerI18n, type ServerI18n } from "@/lib/i18n/server";
import { Badge } from "@/components/ui/badge";
import { Markdown } from "@/components/markdown";
import { PostFeedback } from "@/components/post-feedback";
import { formatDate, estimateReadingMinutes } from "@/lib/utils";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const decoded = decodeURIComponent(slug);
  const post = await getPostBySlug(decoded, true);
  if (!post) return { title: "Not found" };
  return {
    title: post.title,
    description: post.excerpt,
    openGraph: {
      title: post.title,
      description: post.excerpt ?? undefined,
      type: "article",
      publishedTime: post.publishedAt?.toISOString(),
    },
  };
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const decoded = decodeURIComponent(slug);
  const post = await getPostBySlug(decoded, true);
  if (!post) notFound();
  const { t } = await getServerI18n();

  const related = post.category?.id
    ? await relatedPosts(post.id, post.language ?? "en", post.category.id, 3)
    : [];

  return <ArticleView post={post} related={related} t={t} />;
}

function ArticleView({
  post,
  related,
  t,
}: {
  post: NonNullable<Awaited<ReturnType<typeof getPostBySlug>>>;
  related: Awaited<ReturnType<typeof relatedPosts>>;
  t: ServerI18n["t"];
}) {
  const lang = post.language === "fa" ? "fa" : "en";
  const dir = lang === "fa" ? "rtl" : "ltr";

  return (
    <div dir={dir} className="space-y-10 pb-20">
      <div className="border-b bg-gradient-to-b from-accent/50 to-background">
        <div className="container max-w-3xl space-y-6 py-12">
          <Link
            href="/blog"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> {t("article.backToBlog")}
          </Link>
          <Badge variant="outline" className="w-fit text-primary">
            {lang === "fa" ? post.category?.nameFa ?? "AutoAI" : post.category?.nameEn ?? "AutoAI"}
          </Badge>
          <h1 className="text-3xl font-black leading-tight tracking-tight md:text-4xl">{post.title}</h1>
          {post.excerpt && <p className="text-lg text-muted-foreground">{post.excerpt}</p>}
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              {formatDate(post.publishedAt, lang)} · {estimateReadingMinutes(post.content)} min
            </span>
            {post.isAiGenerated && (
              <span className="flex items-center gap-1.5">
                <Bot className="h-4 w-4" />
                <span>{t("article.aiGenerated")}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      <article className="container max-w-3xl">
        <Markdown content={post.content} />
      </article>

      <div className="container max-w-3xl border-t pt-6">
        <PostFeedback postId={post.id} postTitle={post.title} />
      </div>

      {related.length > 0 && (
        <div className="container max-w-3xl">
          <h2 className="mb-4 text-xl font-bold">{t("article.related")}</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {related.map((r) => (
              <Link key={r.id} href={`/blog/${r.slug}`} className="group">
                <div className="flex h-24 items-center justify-center rounded-lg bg-muted/60">
                  <BookOpen className="h-6 w-6 text-primary/50" />
                </div>
                <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-snug group-hover:text-primary">
                  {r.title}
                </h3>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
