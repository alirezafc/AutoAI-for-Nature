import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import { getDb } from "@/db/client";
import { verifyPassword, hashPassword } from "@/lib/auth/password";
import { createSessionToken, setSessionCookie } from "@/lib/auth/session";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  // Production-safe bootstrap: the well-known demo credentials
  // (admin@autoai.local / autoai-admin) are NEVER valid in production.
  // Production admins must set ADMIN_EMAIL + ADMIN_PASSWORD explicitly, or
  // sign in with an account that already exists in the database.
  const isProd = process.env.NODE_ENV === "production";
  const envEmailConfigured = Boolean(process.env.ADMIN_EMAIL);
  const envPasswordConfigured = Boolean(process.env.ADMIN_PASSWORD);
  const envEmail = (process.env.ADMIN_EMAIL || (isProd ? "" : "admin@autoai.local")).toLowerCase();
  const envPassword = process.env.ADMIN_PASSWORD || (isProd ? "" : "autoai-admin");
  const envMatch =
    envEmailConfigured && envPasswordConfigured &&
    email === envEmail && password === envPassword;

  const c = await getDb();
  const existing = await c.db.select().from(users).where(eq(users.email, email)).limit(1);

  let user = existing[0];
  if (!user) {
    if (!envMatch) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }
    const passwordHash = await hashPassword(envPassword);
    const inserted = await c.db
      .insert(users)
      .values({ email, name: "Admin", passwordHash, role: "admin" })
      .returning();
    user = inserted[0];
  } else {
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok && !envMatch) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }
  }

  const token = await createSessionToken({ sub: user.id, email: user.email, role: user.role });
  const isSecure = req.headers.get("x-forwarded-proto") === "https" || req.url.startsWith("https");
  await setSessionCookie(token, isSecure);

  return NextResponse.json({ ok: true, email: user.email, role: user.role });
}
