/**
 * Server-side SmartThings access (used only by the /api/st route handlers).
 *
 * Why this exists: the TV only accepts its remote connection over TLS with a self-signed
 * certificate, which iPhone/Safari refuses. SmartThings controls the same TV through Samsung's
 * cloud with normal certificates, so it works on any phone and away from home.
 *
 * Auth is OAuth 2.0 against a SmartThings "OAuth-In" (API_ONLY) app whose client id/secret live
 * in env vars. Access tokens last 24 h and refresh tokens 29 days (rotated on every refresh).
 * Both are kept in one AES-256-GCM encrypted, httpOnly cookie, so there is no database.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";

export const ST_API = "https://api.smartthings.com";
const AUTHORIZE_URL = ST_API + "/oauth/authorize";
const TOKEN_URL = ST_API + "/oauth/token";
export const ST_SCOPES = "r:devices:* x:devices:*";

const SESSION_COOKIE = "st_session";
const STATE_COOKIE = "st_state";
const REFRESH_LIFETIME_S = 29 * 24 * 3600;

interface Session {
  access: string;
  refresh: string;
  /** Epoch ms when the access token expires. */
  exp: number;
}

export function stConfigured(): boolean {
  return !!(process.env.ST_CLIENT_ID && process.env.ST_CLIENT_SECRET && process.env.SESSION_SECRET);
}

function key(): Buffer {
  // Any length secret → a 32-byte AES key.
  return createHash("sha256").update(process.env.SESSION_SECRET || "").digest();
}

function seal(data: unknown): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([c.update(JSON.stringify(data), "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]).toString("base64url");
}

function open<T>(sealed: string): T | null {
  try {
    const raw = Buffer.from(sealed, "base64url");
    const d = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    const text = Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8");
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function basicAuth(): string {
  return "Basic " + Buffer.from(process.env.ST_CLIENT_ID + ":" + process.env.ST_CLIENT_SECRET).toString("base64");
}

/** Where SmartThings sends the user back; must match the app's registered redirect URI. */
export function redirectUri(origin: string): string {
  return (process.env.ST_REDIRECT_URI || origin + "/api/st/callback").trim();
}

const cookieOpts = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/" };

async function saveSession(s: Session): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, seal(s), { ...cookieOpts, maxAge: REFRESH_LIFETIME_S });
}

export async function clearSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

/** Starts sign-in: remembers a CSRF state and returns the SmartThings authorize URL. */
export async function beginLogin(origin: string): Promise<string> {
  const state = randomBytes(16).toString("base64url");
  (await cookies()).set(STATE_COOKIE, state, { ...cookieOpts, maxAge: 600 });
  const q = new URLSearchParams({
    client_id: process.env.ST_CLIENT_ID || "",
    response_type: "code",
    redirect_uri: redirectUri(origin),
    scope: ST_SCOPES,
    state,
  });
  return AUTHORIZE_URL + "?" + q.toString();
}

async function tokenRequest(params: Record<string, string>): Promise<Session> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.ST_CLIENT_ID || "", ...params }).toString(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error("SmartThings token request failed: " + res.status + " " + (await res.text()).slice(0, 200));
  const t = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
  return { access: t.access_token, refresh: t.refresh_token, exp: Date.now() + (t.expires_in || 86400) * 1000 };
}

/** Finishes sign-in: checks state, swaps the code for tokens and stores them. */
export async function finishLogin(origin: string, code: string, state: string): Promise<void> {
  const jar = await cookies();
  const expected = jar.get(STATE_COOKIE)?.value;
  jar.delete(STATE_COOKIE);
  if (!expected || expected !== state) throw new Error("Sign-in expired or was tampered with. Try again.");
  await saveSession(await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri(origin) }));
}

/** A valid access token, refreshing (and re-saving the rotated tokens) when it's near expiry. */
export async function accessToken(): Promise<string | null> {
  const sealed = (await cookies()).get(SESSION_COOKIE)?.value;
  const s = sealed ? open<Session>(sealed) : null;
  if (!s) return null;
  if (s.exp - Date.now() > 5 * 60 * 1000) return s.access;
  try {
    const next = await tokenRequest({ grant_type: "refresh_token", refresh_token: s.refresh });
    await saveSession(next);
    return next.access;
  } catch {
    await clearSession();
    return null;
  }
}

export async function stFetch(path: string, token: string, init: RequestInit = {}): Promise<Response> {
  return fetch(ST_API + path, {
    ...init,
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", ...(init.headers || {}) },
    cache: "no-store",
  });
}
