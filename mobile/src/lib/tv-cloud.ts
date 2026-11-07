import * as WebBrowser from "expo-web-browser";
import { ST_KEYS, stLaunch, type StCommand } from "../../../src/lib/st/commands";
import { prefs, secrets } from "./storage";

/**
 * SmartThings mode: the same /api/st routes as the website, on Vercel. The app's sign-in comes
 * back as an encrypted session through tvremote://auth; it lives in the Keychain / Keystore and
 * goes out as `Authorization: Session …`. When the server refreshes the SmartThings tokens it
 * returns the new session in `X-ST-Session`, which replaces the stored one.
 */
export const API = "https://tv-remote-delta.vercel.app";
const SESSION_KEY = "st_session";
const DEVICE_KEY = "tv.st.device";

export type CloudStatus = "checking" | "not-configured" | "signed-out" | "no-tv" | "connected" | "error";
export interface CloudTv {
  id: string;
  name: string;
}

export class CloudTvConnection {
  private status: CloudStatus = "checking";
  private listeners = new Set<(s: CloudStatus) => void>();
  tvs: CloudTv[] = [];
  deviceId = "";

  onStatus(fn: (s: CloudStatus) => void): () => void {
    this.listeners.add(fn);
    fn(this.status);
    return () => this.listeners.delete(fn);
  }

  getStatus(): CloudStatus {
    return this.status;
  }

  private set(s: CloudStatus): void {
    this.status = s;
    this.listeners.forEach((fn) => fn(s));
  }

  private async api(path: string, init: RequestInit = {}): Promise<Response> {
    const session = await secrets.get(SESSION_KEY);
    const res = await fetch(API + path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(session ? { Authorization: "Session " + session } : {}),
        ...(init.headers || {}),
      },
    });
    const renewed = res.headers.get("x-st-session");
    if (renewed) await secrets.set(SESSION_KEY, renewed);
    return res;
  }

  async init(): Promise<void> {
    this.set("checking");
    try {
      const res = await this.api("/api/st/devices");
      const data = (await res.json()) as { configured: boolean; signedIn: boolean; tvs: CloudTv[] };
      if (!data.configured) return this.set("not-configured");
      if (!data.signedIn) return this.set("signed-out");
      this.tvs = data.tvs || [];
      if (!this.tvs.length) return this.set("no-tv");
      const saved = await prefs.get<string>(DEVICE_KEY, "");
      this.deviceId = (this.tvs.find((t) => t.id === saved) || this.tvs[0]).id;
      this.set("connected");
    } catch {
      this.set("error");
    }
  }

  /** Samsung sign-in in a secure browser sheet; the session comes back via tvremote://auth. */
  async signIn(): Promise<string | null> {
    const result = await WebBrowser.openAuthSessionAsync(API + "/api/st/login?client=app", "tvremote://auth");
    if (result.type !== "success") return result.type === "cancel" ? null : "Sign-in was closed";
    const err = await saveSessionFromUrl(result.url);
    if (!err) await this.init();
    return err;
  }

  async signOut(): Promise<void> {
    await secrets.remove(SESSION_KEY);
    this.tvs = [];
    this.set("signed-out");
  }

  async chooseTv(id: string): Promise<void> {
    this.deviceId = id;
    await prefs.set(DEVICE_KEY, id);
    this.listeners.forEach((fn) => fn(this.status));
  }

  supports(code: string): boolean {
    return code in ST_KEYS;
  }

  async send(command: StCommand): Promise<boolean> {
    if (this.status !== "connected" || !this.deviceId) return false;
    try {
      const res = await this.api("/api/st/command", {
        method: "POST",
        body: JSON.stringify({ deviceId: this.deviceId, command }),
      });
      if (res.status === 401) this.set("signed-out");
      return res.ok;
    } catch {
      return false;
    }
  }

  key(code: string): Promise<boolean> {
    const cmd = ST_KEYS[code];
    return cmd ? this.send(cmd) : Promise.resolve(false);
  }

  launch(appId: string, appName: string): Promise<boolean> {
    return this.send(stLaunch(appId, appName));
  }
}

/** Stores the session from tvremote://auth?session=… (or returns its ?error=). */
export async function saveSessionFromUrl(url: string): Promise<string | null> {
  const query = url.split("?")[1] || "";
  const params: Record<string, string> = {};
  for (const part of query.split("&")) {
    const [k, v = ""] = part.split("=");
    if (k) params[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, " "));
  }
  if (params.session) {
    await secrets.set(SESSION_KEY, params.session);
    return null;
  }
  return params.error || "Sign-in failed";
}
