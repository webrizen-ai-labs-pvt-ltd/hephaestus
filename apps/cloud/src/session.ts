import type { ViewerOrg } from "@operant/core";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { EncryptJWT, jwtDecrypt } from "jose";

/** What we keep in the encrypted, HTTP-only session cookie. */
export interface SessionData {
  user: { id: string; email: string; name: string; image: string | null };
  org: ViewerOrg | null;
  accessToken?: string;
  refreshToken?: string;
  idToken?: string;
  /** Access token expiry, unix seconds. */
  expiresAt: number;
}

export const SESSION_COOKIE = "heph_session";
export const TX_COOKIE = "heph_tx";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

export async function deriveKey(secret: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return new Uint8Array(digest);
}

export async function seal(payload: object, key: Uint8Array, maxAgeSeconds: number) {
  return new EncryptJWT({ ...payload })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime(`${maxAgeSeconds}s`)
    .encrypt(key);
}

export async function unseal<T>(token: string | undefined, key: Uint8Array): Promise<T | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtDecrypt(token, key);
    return payload as T;
  } catch {
    return null;
  }
}

function cookieOptions(secure: boolean, maxAge: number) {
  return { httpOnly: true, secure, sameSite: "Lax" as const, path: "/", maxAge };
}

export async function writeSession(c: Context, data: SessionData, key: Uint8Array, secure: boolean) {
  setCookie(c, SESSION_COOKIE, await seal(data, key, SESSION_MAX_AGE), cookieOptions(secure, SESSION_MAX_AGE));
}

export function readSession(c: Context, key: Uint8Array) {
  return unseal<SessionData>(getCookie(c, SESSION_COOKIE), key);
}

export function clearSession(c: Context) {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

export async function writeTx(c: Context, data: object, key: Uint8Array, secure: boolean) {
  setCookie(c, TX_COOKIE, await seal(data, key, 600), cookieOptions(secure, 600));
}

export async function takeTx<T>(c: Context, key: Uint8Array) {
  const tx = await unseal<T>(getCookie(c, TX_COOKIE), key);
  deleteCookie(c, TX_COOKIE, { path: "/" });
  return tx;
}
