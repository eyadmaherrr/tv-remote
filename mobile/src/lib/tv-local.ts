import { TvSocket } from "../../modules/tv-socket/src";
import { secrets, tokenKey } from "./storage";

/**
 * Wi-Fi mode: straight to the TV's built-in remote API (wss://<ip>:8002), like the website —
 * but through the native TvSocket module, which trusts the TV's own Samsung certificate, so
 * this works on iPhone too. The first connection shows "Allow" on the TV; the token it returns
 * is kept in the Keychain / Keystore.
 */
export type LocalStatus = "idle" | "connecting" | "waiting" | "connected" | "unreachable" | "denied";

const CLIENT_NAME = "Phone Remote";
const OPEN_TIMEOUT_MS = 8000;

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function utf8(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    const c = ch.codePointAt(0) as number;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

/** UTF-8 safe base64 (Arabic text, emoji) without relying on btoa. */
export function b64(text: string): string {
  const bytes = utf8(text);
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b, c] = [bytes[i], bytes[i + 1], bytes[i + 2]];
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (b === undefined ? "=" : B64[(n >> 6) & 63]) + (c === undefined ? "=" : B64[n & 63]);
  }
  return out;
}

export function isValidIp(ip: string): boolean {
  const m = ip.trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  return !!m && m.slice(1).every((n) => Number(n) <= 255);
}

export class LocalTv {
  private status: LocalStatus = "idle";
  private listeners = new Set<(s: LocalStatus) => void>();
  private subs: { remove(): void }[] = [];
  private openTimer: ReturnType<typeof setTimeout> | null = null;
  private opened = false;

  constructor(readonly ip: string) {}

  onStatus(fn: (s: LocalStatus) => void): () => void {
    this.listeners.add(fn);
    fn(this.status);
    return () => this.listeners.delete(fn);
  }

  getStatus(): LocalStatus {
    return this.status;
  }

  private set(s: LocalStatus): void {
    if (s === this.status) return;
    this.status = s;
    this.listeners.forEach((fn) => fn(s));
  }

  async connect(): Promise<void> {
    if (this.status === "connecting" || this.status === "waiting" || this.status === "connected") return;
    this.detach();
    this.set("connecting");
    this.opened = false;
    const token = await secrets.get(tokenKey(this.ip));
    const url =
      `wss://${this.ip}:8002/api/v2/channels/samsung.remote.control?name=${encodeURIComponent(b64(CLIENT_NAME))}` +
      (token ? `&token=${encodeURIComponent(token)}` : "");

    this.subs = [
      TvSocket.addListener("onOpen", () => {
        this.opened = true;
        if (this.openTimer) clearTimeout(this.openTimer);
        this.set("waiting");
      }),
      TvSocket.addListener("onMessage", ({ data }) => this.onMessage(data)),
      TvSocket.addListener("onError", () => {
        if (!this.opened) this.set("unreachable");
        else this.set("idle");
      }),
      TvSocket.addListener("onClose", () => {
        if (this.status !== "denied") this.set(this.opened ? "idle" : "unreachable");
      }),
    ];
    this.openTimer = setTimeout(() => {
      if (!this.opened) {
        TvSocket.close();
        this.set("unreachable");
      }
    }, OPEN_TIMEOUT_MS);
    try {
      await TvSocket.connect(url, this.ip);
    } catch {
      this.set("unreachable");
    }
  }

  private onMessage(data: string): void {
    let msg: { event?: string; data?: { token?: string | number } };
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }
    if (msg.event === "ms.channel.connect") {
      if (msg.data && msg.data.token) secrets.set(tokenKey(this.ip), String(msg.data.token));
      this.set("connected");
    } else if (msg.event === "ms.channel.unauthorized" || msg.event === "ms.channel.timeOut") {
      secrets.remove(tokenKey(this.ip));
      this.set("denied");
    }
  }

  private detach(): void {
    if (this.openTimer) clearTimeout(this.openTimer);
    this.subs.forEach((s) => s.remove());
    this.subs = [];
  }

  close(): void {
    this.detach();
    TvSocket.close();
    this.set("idle");
  }

  private send(payload: unknown): boolean {
    if (this.status !== "connected") {
      if (this.status === "idle" || this.status === "unreachable") this.connect();
      return false;
    }
    TvSocket.send(JSON.stringify(payload));
    return true;
  }

  key(code: string): boolean {
    return this.send({
      method: "ms.remote.control",
      params: { Cmd: "Click", DataOfCmd: code, Option: "false", TypeOfRemote: "SendRemoteKey" },
    });
  }

  /** Types into the TV's on-screen keyboard (it must be open on the TV). */
  type(text: string): boolean {
    const ok = this.send({
      method: "ms.remote.control",
      params: { Cmd: b64(text), DataOfCmd: "base64", TypeOfRemote: "SendInputString" },
    });
    if (ok) this.send({ method: "ms.remote.control", params: { TypeOfRemote: "SendInputEnd" } });
    return ok;
  }

  async launch(appId: string): Promise<boolean> {
    try {
      const r = await TvSocket.request("POST", `https://${this.ip}:8002/api/v2/applications/${encodeURIComponent(appId)}`, this.ip);
      return r.status >= 200 && r.status < 300;
    } catch {
      return false;
    }
  }

  async forgetPairing(): Promise<void> {
    await secrets.remove(tokenKey(this.ip));
  }
}
