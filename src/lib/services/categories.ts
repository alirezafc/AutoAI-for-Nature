import { eq, asc, count } from "drizzle-orm";
import { categories, posts } from "@/db/schema";
import { getDb } from "@/db/client";
import { logAudit } from "./audit";

export interface CategoryInput {
  slug?: string;
  nameEn: string;
  nameFa: string;
  descriptionEn?: string;
  descriptionFa?: string;
  color?: string;
}

export async function listCategories() {
  const c = await getDb();
  return c.db.select().from(categories).orderBy(asc(categories.createdAt));
}

export async function getCategory(slug: string) {
  const c = await getDb();
  const rows = await c.db.select().from(categories).where(eq(categories.slug, slug)).limit(1);
  return rows[0];
}

export async function listCategoriesWithCounts() {
  const c = await getDb();
  const cats = await listCategories();
  const counts = await c.db
    .select({ categoryId: posts.categoryId, value: count() })
    .from(posts)
    .where(eq(posts.status, "published"))
    .groupBy(posts.categoryId);
  const map = new Map<string | null, number>();
  for (const row of counts) map.set(row.categoryId, Number(row.value));
  return cats.map((cat) => ({ ...cat, postCount: map.get(cat.id) ?? 0 }));
}

export async function createCategory(input: CategoryInput) {
  const c = await getDb();
  const slug = input.slug ?? input.nameEn.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const [row] = await c.db
    .insert(categories)
    .values({
      slug,
      nameEn: input.nameEn,
      nameFa: input.nameFa,
      descriptionEn: input.descriptionEn ?? "",
      descriptionFa: input.descriptionFa ?? "",
      color: input.color ?? "#16a34a",
    })
    .returning();
  await logAudit({ actor: "admin", action: "category.create", metadata: { slug } });
  return row;
}

export async function updateCategory(id: string, input: Partial<CategoryInput>) {
  const c = await getDb();
  const patch: Record<string, unknown> = {};
  if (input.slug !== undefined) patch.slug = input.slug;
  if (input.nameEn !== undefined) patch.nameEn = input.nameEn;
  if (input.nameFa !== undefined) patch.nameFa = input.nameFa;
  if (input.descriptionEn !== undefined) patch.descriptionEn = input.descriptionEn;
  if (input.descriptionFa !== undefined) patch.descriptionFa = input.descriptionFa;
  if (input.color !== undefined) patch.color = input.color;
  const [row] = await c.db.update(categories).set(patch).where(eq(categories.id, id)).returning();
  await logAudit({ actor: "admin", action: "category.update", metadata: { id } });
  return row;
}

export async function deleteCategory(id: string) {
  const c = await getDb();
  await c.db.delete(categories).where(eq(categories.id, id));
  await logAudit({ actor: "admin", action: "category.delete", metadata: { id } });
}
