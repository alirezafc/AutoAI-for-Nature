import { NextResponse } from "next/server";
import {
  listKnowledgeDocuments,
  createKnowledgeDocument,
  updateKnowledgeDocument,
  deleteKnowledgeDocument,
  setDocumentStatus,
  indexDocument,
} from "@/lib/rag";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ documents: await listKnowledgeDocuments() });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.title || !body?.content) {
    return NextResponse.json({ error: "title and content required" }, { status: 400 });
  }
  const doc = await createKnowledgeDocument({
    title: String(body.title),
    content: String(body.content),
    language: body.language === "fa" ? "fa" : "en",
    author: String(body.author ?? "admin"),
    sourceType: body.sourceType === "curated" ? "curated" : "article",
    status: body.status === "inactive" ? "inactive" : "active",
  });
  let indexed = null;
  if (body.index !== false) {
    indexed = await indexDocument(doc.id, "admin-create");
  }
  return NextResponse.json({ document: { ...doc, ...(indexed ? { indexed } : {}) } }, { status: 201 });
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const doc = await updateKnowledgeDocument(String(body.id), {
    title: body.title !== undefined ? String(body.title) : undefined,
    content: body.content !== undefined ? String(body.content) : undefined,
    language: body.language !== undefined ? (body.language === "fa" ? "fa" : "en") : undefined,
    author: body.author !== undefined ? String(body.author) : undefined,
  });
  if (body.status) await setDocumentStatus(String(body.id), body.status === "inactive" ? "inactive" : "active");
  if (body.content !== undefined || body.title !== undefined) {
    const updated = doc;
    if (updated) {
      await indexDocument(updated.id, "admin-update").catch(() => {});
    }
  }
  return NextResponse.json({ document: doc });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await deleteKnowledgeDocument(id);
  return NextResponse.json({ ok: true });
}
