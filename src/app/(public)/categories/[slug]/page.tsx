import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen } from "lucide-react";
import { getCategory, listCategoriesWithCounts } from "@/lib/services/categories";
import { listPublishedPosts } from "@/lib/services/posts";
import { getServerI18n, type ServerI18n } from "@/lib/i18n/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, estimateReadingMinutes } from "@/lib/utils";

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { t } = await getServerI18n();
  const [category, categories] = await Promise.all([getCategory(slug), listCategoriesWithCounts()]);
  if (!category) notFound();
  const posts = await listPublishedPosts({ categorySlug: slug });
  return <CategoryView category={category} categories={categories} posts={posts} t={t} />;
}

function CategoryView({
  category,
  categories,
  posts,
  t,
}: {
  category: NonNullable<Awaited<ReturnType<typeof getCategory>>>;
  categories: Awaited<ReturnType<typeof listCategoriesWithCounts>>;
  posts: Awaited<ReturnType<typeof listPublishedPosts>>;
  t: ServerI18n["t"];
}) {
  return (
    <div className="container max-w-5xl space-y-8 py-12">
      <Link
        href="/blog"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {t("article.backToBlog")}
      </Link>
      <div className="flex items-center gap-3">
        <span className="h-4 w-4 rounded-full" style={{ backgroundColor: category.color }} />
        <h1 className="text-3xl font-black tracking-tight">{category.nameEn}</h1>
      </div>
      <p className="max-w-2xl text-muted-foreground">{category.descriptionEn}</p>

      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => (
          <Link
            key={cat.id}
            href={`/categories/${cat.slug}`}
            className={
              cat.slug === category.slug
                ? "rounded-full bg-primary px-3 py-1 text-sm font-medium text-primary-foreground"
                : "rounded-full border bg-background px-3 py-1 text-sm font-medium transition-colors hover:bg-accent"
            }
          >
            {cat.nameEn} · {cat.postCount}
          </Link>
        ))}
      </div>

      {posts.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">{t("common.noResults")}</div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {posts.map((p) => (
            <Link key={p.id} href={`/blog/${p.slug}`} className="group">
              <Card className="h-full overflow-hidden transition-shadow group-hover:shadow-md">
                <div className="flex h-36 items-center justify-center bg-gradient-to-br from-primary/15 via-accent to-background">
                  <BookOpen className="h-8 w-8 text-primary/50" />
                </div>
                <CardContent className="space-y-2 p-5">
                  <Badge variant="outline" className="text-primary">
                    {p.category?.nameEn ?? category.nameEn}
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
