import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE_NAME = "autoai_session";
const SESSION_TTL = "12h";

export interface SessionPayload {
  sub: string;
  email: string;
  role: string;
}

const INSECURE_DEV_SECRET = "insecure-default-secret-change-me";

function rawSecret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value && process.env.NODE_ENV === "production") {
    throw new Error(
      "AUTH_SECRET is not configured. Set AUTH_SECRET to a long random string in the production environment."
    );
  }
  return value || INSECURE_DEV_SECRET;
}

function encodeSecret(): Uint8Array {
  let value = rawSecret();
  if (process.env.NODE_ENV === "production" && value.length < 32) {
    throw new Error("AUTH_SECRET must be at least 32 characters long.");
  }
  if (value.length < 32) {
    console.warn("AutoAI: AUTH_SECRET is shorter than 32 characters; set a long random secret (dev fallback padded).");
    value = value.padEnd(32, "x");
  }
  return new TextEncoder().encode(value);
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({
    sub: payload.sub,
    email: payload.email,
    role: payload.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(encodeSecret());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, encodeSecret());
    return {
      sub: String(payload.sub ?? ""),
      email: String(payload.email ?? ""),
      role: String(payload.role ?? "admin"),
    };
  } catch {
    return null;
  }
}

export async function getSessionFromCookies(): Promise<SessionPayload | null> {
  try {
    const store = await cookies();
    const token = store.get(COOKIE_NAME)?.value;
    if (!token) return null;
    return verifySessionToken(token);
  } catch {
    return null;
  }
}

export async function setSessionCookie(token: string, isSecure = true): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecure && process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export const SESSION_COOKIE = COOKIE_NAME;
