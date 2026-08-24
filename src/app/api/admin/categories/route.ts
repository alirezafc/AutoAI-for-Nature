import { NextResponse } from "next/server";
import { listCategoriesWithCounts, createCategory, updateCategory, deleteCategory } from "@/lib/services/categories";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ categories: await listCategoriesWithCounts() });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.nameEn || !body?.nameFa) {
    return NextResponse.json({ error: "nameEn and nameFa required" }, { status: 400 });
  }
  const category = await createCategory({
    slug: typeof body.slug === "string" ? body.slug : undefined,
    nameEn: String(body.nameEn),
    nameFa: String(body.nameFa),
    descriptionEn: String(body.descriptionEn ?? ""),
    descriptionFa: String(body.descriptionFa ?? ""),
    color: typeof body.color === "string" ? body.color : undefined,
  });
  return NextResponse.json({ category }, { status: 201 });
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const category = await updateCategory(String(body.id), {
    slug: body.slug !== undefined ? String(body.slug) : undefined,
    nameEn: body.nameEn !== undefined ? String(body.nameEn) : undefined,
    nameFa: body.nameFa !== undefined ? String(body.nameFa) : undefined,
    descriptionEn: body.descriptionEn !== undefined ? String(body.descriptionEn) : undefined,
    descriptionFa: body.descriptionFa !== undefined ? String(body.descriptionFa) : undefined,
    color: body.color !== undefined ? String(body.color) : undefined,
  });
  return NextResponse.json({ category });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await deleteCategory(id);
  return NextResponse.json({ ok: true });
}
