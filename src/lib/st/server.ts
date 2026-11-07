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
/** Set when sign-in was started by the mobile app (it gets its session back via tvremote://). */
const CLIENT_COOKIE = "st_client";
/** The mobile app sends its session as `Authorization: Session <sealed>`. */
const SESSION_HEADER_PREFIX = "Session ";
/** Where the mobile app receives its session after sign-in. */
export const APP_REDIRECT = "tvremote://auth";
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
export async function beginLogin(origin: string, forApp = false): Promise<string> {
  const state = randomBytes(16).toString("base64url");
  const jar = await cookies();
  jar.set(STATE_COOKIE, state, { ...cookieOpts, maxAge: 600 });
  if (forApp) jar.set(CLIENT_COOKIE, "app", { ...cookieOpts, maxAge: 600 });
  else jar.delete(CLIENT_COOKIE);
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

/**
 * Finishes sign-in: checks state and swaps the code for tokens. The website keeps them in its
 * cookie; for the mobile app the sealed session is returned so the callback can hand it over.
 */
export async function finishLogin(origin: string, code: string, state: string): Promise<{ appSession?: string }> {
  const jar = await cookies();
  const expected = jar.get(STATE_COOKIE)?.value;
  const forApp = jar.get(CLIENT_COOKIE)?.value === "app";
  jar.delete(STATE_COOKIE);
  jar.delete(CLIENT_COOKIE);
  if (!expected || expected !== state) throw new Error("Sign-in expired or was tampered with. Try again.");
  const session = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri(origin) });
  if (forApp) return { appSession: seal(session) };
  await saveSession(session);
  return {};
}

/** Whether this sign-in was started by the mobile app (read before finishLogin clears it). */
export async function loginIsForApp(): Promise<boolean> {
  return (await cookies()).get(CLIENT_COOKIE)?.value === "app";
}

export interface StAuth {
  token: string | null;
  /** Mobile app only: the re-sealed session after a refresh, for the app to store. */
  renewed?: string;
}

/**
 * A valid access token for this request, refreshing when it's near expiry. The website's
 * session is in a cookie (re-saved on refresh); the mobile app sends its own in a header and
 * gets the rotated one back in `renewed`.
 */
export async function auth(request?: Request): Promise<StAuth> {
  const header = request ? request.headers.get("authorization") || "" : "";
  const fromApp = header.startsWith(SESSION_HEADER_PREFIX);
  const sealed = fromApp ? header.slice(SESSION_HEADER_PREFIX.length).trim() : (await cookies()).get(SESSION_COOKIE)?.value;
  const s = sealed ? open<Session>(sealed) : null;
  if (!s) return { token: null };
  if (s.exp - Date.now() > 5 * 60 * 1000) return { token: s.access };
  try {
    const next = await tokenRequest({ grant_type: "refresh_token", refresh_token: s.refresh });
    if (fromApp) return { token: next.access, renewed: seal(next) };
    await saveSession(next);
    return { token: next.access };
  } catch {
    if (!fromApp) await clearSession();
    return { token: null };
  }
}

/** JSON response that also hands a renewed app session back in `X-ST-Session`. */
export function json(body: unknown, a: StAuth | null, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (a && a.renewed) headers.set("X-ST-Session", a.renewed);
  return Response.json(body, { ...init, headers });
}

export async function stFetch(path: string, token: string, init: RequestInit = {}): Promise<Response> {
  return fetch(ST_API + path, {
    ...init,
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", ...(init.headers || {}) },
    cache: "no-store",
  });
}
