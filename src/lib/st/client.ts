/** Browser side of SmartThings mode: talks to this site's /api/st routes. */
import { ST_KEYS, stLaunch, type StCommand } from "./commands";

export type CloudStatus =
  | "checking"
  | "not-configured" // the site has no SmartThings app set up
  | "signed-out"
  | "no-tv" // signed in, but no TV in this SmartThings account
  | "connected"
  | "error";

export interface CloudTv {
  id: string;
  name: string;
}

const DEVICE_KEY = "tv.st.device";

export class CloudConnection {
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
    if (s === this.status) return;
    this.status = s;
    this.listeners.forEach((fn) => fn(s));
  }

  /** Loads the account's TVs and picks the saved one (or the only one). */
  async init(): Promise<void> {
    this.set("checking");
    try {
      const res = await fetch("/api/st/devices", { cache: "no-store" });
      const data = (await res.json()) as { configured: boolean; signedIn: boolean; tvs: CloudTv[] };
      if (!data.configured) return this.set("not-configured");
      if (!data.signedIn) return this.set("signed-out");
      this.tvs = data.tvs || [];
      if (!this.tvs.length) return this.set("no-tv");
      let saved = "";
      try {
        saved = localStorage.getItem(DEVICE_KEY) || "";
      } catch {
        /* ignore */
      }
      this.deviceId = (this.tvs.find((t) => t.id === saved) || this.tvs[0]).id;
      this.set("connected");
    } catch {
      this.set("error");
    }
  }

  chooseTv(id: string): void {
    this.deviceId = id;
    try {
      localStorage.setItem(DEVICE_KEY, id);
    } catch {
      /* ignore */
    }
  }

  async signOut(): Promise<void> {
    await fetch("/api/st/logout", { method: "POST" });
    this.set("signed-out");
  }

  /** Whether a remote key exists in SmartThings mode. */
  supports(code: string): boolean {
    return code in ST_KEYS;
  }

  async send(command: StCommand): Promise<boolean> {
    if (this.status !== "connected" || !this.deviceId) return false;
    try {
      const res = await fetch("/api/st/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
