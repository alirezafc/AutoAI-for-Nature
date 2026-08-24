import { NextResponse } from "next/server";
import { listPosts, createPost, getPost, updatePost, deletePost, setPostStatus, type PostStatus } from "@/lib/services/posts";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? undefined;
  const language = url.searchParams.get("language") ?? undefined;
  const search = url.searchParams.get("search") ?? undefined;
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 100)));
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0));
  const posts = await listPosts({ status, language, search, limit, offset });
  return NextResponse.json({ posts });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.title) return NextResponse.json({ error: "title required" }, { status: 400 });
  const post = await createPost(
    {
      title: String(body.title),
      content: String(body.content ?? ""),
      excerpt: String(body.excerpt ?? ""),
      language: body.language === "fa" ? "fa" : "en",
      status: body.status === "published" ? "published" : "draft",
      categoryId: typeof body.categoryId === "string" ? body.categoryId : null,
      isAiGenerated: Boolean(body.isAiGenerated),
      authorName: String(body.authorName ?? "Admin"),
      seo: body.seo ?? {},
    },
    "admin"
  );
  if (post.status === "published") await setPostStatus(post.id, "published", "admin");
  return NextResponse.json({ post }, { status: 201 });
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const patch: {
    title?: string;
    content?: string;
    excerpt?: string;
    language?: "en" | "fa";
    status?: PostStatus;
    categoryId?: string | null;
    coverImage?: string;
    tags?: string[];
    seo?: unknown;
    authorName?: string;
    slug?: string;
  } = {};
  if (body.title !== undefined) patch.title = String(body.title);
  if (body.content !== undefined) patch.content = String(body.content);
  if (body.excerpt !== undefined) patch.excerpt = String(body.excerpt);
  if (body.language !== undefined) patch.language = body.language === "fa" ? "fa" : "en";
  if (body.status !== undefined) patch.status = body.status as PostStatus;
  if (body.categoryId !== undefined) patch.categoryId = body.categoryId === null ? null : String(body.categoryId);
  if (body.coverImage !== undefined) patch.coverImage = String(body.coverImage);
  if (body.tags !== undefined) patch.tags = Array.isArray(body.tags) ? body.tags.map(String) : [];
  if (body.seo !== undefined) patch.seo = body.seo;
  if (body.authorName !== undefined) patch.authorName = String(body.authorName);
  if (body.slug !== undefined) patch.slug = String(body.slug);

  const post = await updatePost(String(body.id), patch as Parameters<typeof updatePost>[1], "admin");
  if (body.status === "published" && post.status !== "published") await setPostStatus(post.id, "published", "admin");
  return NextResponse.json({ post });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await deletePost(id, "admin");
  return NextResponse.json({ ok: true });
}
