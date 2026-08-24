import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const COOKIE = "autoai_session";

function encodeSecret(): Uint8Array {
  const value = process.env.AUTH_SECRET;
  const isProd = process.env.NODE_ENV === "production";
  if ((!value || value.length < 32) && isProd) {
    throw new Error(
      "AUTH_SECRET is not configured or too short. Set AUTH_SECRET to a long random string (32+ characters) in the production environment."
    );
  }
  // Same fallback logic as src/lib/auth/session.ts — middleware runs in a
  // separate Edge runtime bundle, so it must stay consistent with session.ts.
  const secret = (value || "insecure-default-secret-change-me").padEnd(32, "x");
  return new TextEncoder().encode(secret);
}

async function isAuthed(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(COOKIE)?.value;
  if (!token) return false;
  try {
    await jwtVerify(token, encodeSecret());
    return true;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Admin pages (excluding the login and setup pages) require a session.
  if (pathname.startsWith("/admin") && !pathname.startsWith("/admin/login") && !pathname.startsWith("/admin/setup")) {
    const ok = await isAuthed(req);
    if (!ok) {
      const login = new URL("/admin/login", req.url);
      login.searchParams.set("from", pathname);
      return NextResponse.redirect(login);
    }
  }

  // Admin API routes require a session.
  if (pathname.startsWith("/api/admin")) {
    const ok = await isAuthed(req);
    if (!ok) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
