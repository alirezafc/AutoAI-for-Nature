import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import { getDb } from "@/db/client";
import { hashPassword } from "@/lib/auth/password";
import { createSessionToken, setSessionCookie } from "@/lib/auth/session";

export async function GET() {
  // setup-status: true when no admin user exists yet (first run)
  const c = await getDb();
  const count = await c.db.select().from(users).limit(1);
  return NextResponse.json({ needsSetup: count.length === 0 });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");
  const name = String(body?.name ?? "Admin").trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const c = await getDb();
  const existing = await c.db.select().from(users).limit(1);
  if (existing.length > 0) {
    return NextResponse.json({ error: "Setup already completed" }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const [user] = await c.db
    .insert(users)
    .values({ email, name, passwordHash, role: "admin" })
    .returning();

  const token = await createSessionToken({ sub: user.id, email: user.email, role: user.role });
  const isSecure = req.headers.get("x-forwarded-proto") === "https" || req.url.startsWith("https");
  await setSessionCookie(token, isSecure);

  return NextResponse.json({ ok: true, email: user.email, role: user.role });
}

export const dynamic = "force-dynamic";
