import Link from "next/link";
import { BookOpen, Search } from "lucide-react";
import { listPublishedPosts } from "@/lib/services/posts";
import { listCategories } from "@/lib/services/categories";
import { getServerI18n, type ServerI18n } from "@/lib/i18n/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate, estimateReadingMinutes } from "@/lib/utils";

export default async function BlogPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; q?: string }>;
}) {
  const { t } = await getServerI18n();
  const { category, q } = await searchParams;
  const [posts, categories] = await Promise.all([
    listPublishedPosts({ categorySlug: category, search: q }),
    listCategories(),
  ]);
  return <BlogView posts={posts} categories={categories} activeCategory={category} t={t} />;
}

function BlogView({
  posts,
  categories,
  activeCategory,
  t,
}: {
  posts: Awaited<ReturnType<typeof listPublishedPosts>>;
  categories: Awaited<ReturnType<typeof listCategories>>;
  activeCategory?: string;
  t: ServerI18n["t"];
}) {
  return (
    <div className="container max-w-6xl space-y-10 py-12">
      <div className="text-center">
        <h1 className="text-4xl font-black tracking-tight">{t("blog.title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("blog.subtitle")}</p>
      </div>

      <div className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          type="search"
          name="q"
          placeholder={t("blog.searchPlaceholder")}
          className="w-full bg-transparent text-sm focus:outline-none"
          form="search-form"
        />
      </div>
      <form id="search-form" className="hidden" action="/blog" method="GET" />

      <div className="flex flex-wrap gap-2">
        <Link
          href="/blog"
          className={
            !activeCategory
              ? "rounded-full bg-primary px-3 py-1 text-sm font-medium text-primary-foreground"
              : "rounded-full border bg-background px-3 py-1 text-sm font-medium transition-colors hover:bg-accent"
          }
        >
          {t("common.all")}
        </Link>
        {categories.map((cat) => (
          <Link
            key={cat.id}
            href={`/blog?category=${cat.slug}`}
            className={
              activeCategory === cat.slug
                ? "rounded-full bg-primary px-3 py-1 text-sm font-medium text-primary-foreground"
                : "rounded-full border bg-background px-3 py-1 text-sm font-medium transition-colors hover:bg-accent"
            }
          >
            {cat.nameEn}
          </Link>
        ))}
      </div>

      {posts.length === 0 ? (
        <div className="py-20 text-center text-muted-foreground">{t("common.noResults")}</div>
      ) : (
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
                  <h2 className="line-clamp-2 font-semibold leading-snug group-hover:text-primary">
                    {p.title}
                  </h2>
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
      )}
    </div>
  );
}
