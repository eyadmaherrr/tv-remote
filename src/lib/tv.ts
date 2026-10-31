/**
 * Talks to a Samsung Tizen TV's built-in remote API (2016+ models) straight from the
 * browser. The phone must be on the same network as the TV.
 *
 * - Keys and text go over a WebSocket: wss://<ip>:8002/api/v2/channels/samsung.remote.control
 * - Apps launch over REST: POST https://<ip>:8002/api/v2/applications/<appId>
 *
 * The TV serves a self-signed certificate on port 8002, so the browser has to trust it once
 * (open https://<ip>:8002 and accept the warning). The first connection shows an "Allow"
 * prompt on the TV; the token it returns is stored per TV so later connections are silent.
 */

export type TvStatus =
  | "idle" // not connected
  | "connecting" // socket opening
  | "waiting" // socket open, waiting for the TV (Allow prompt on first use)
  | "connected"
  | "unreachable" // couldn't open the socket: certificate not trusted, wrong IP, or other network
  | "denied"; // the TV refused (Deny pressed, or the prompt timed out)

const CLIENT_NAME = "Phone Remote";
const OPEN_TIMEOUT_MS = 8000;

const tokenKey = (ip: string) => "tv.token." + ip;

function b64(text: string): string {
  // Unicode-safe base64 (Arabic text, emoji…).
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

function readToken(ip: string): string {
  try {
    return localStorage.getItem(tokenKey(ip)) || "";
  } catch {
    return "";
  }
}

function writeToken(ip: string, token: string): void {
  try {
    localStorage.setItem(tokenKey(ip), token);
  } catch {
    /* private mode: pairing just repeats next time */
  }
}

export function forgetToken(ip: string): void {
  try {
    localStorage.removeItem(tokenKey(ip));
  } catch {
    /* ignore */
  }
}

/** Page the user opens once so the browser trusts the TV's self-signed certificate. */
export function certUrl(ip: string): string {
  return `https://${ip}:8002/api/v2/`;
}

export function isValidIp(ip: string): boolean {
  const m = ip.trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  return !!m && m.slice(1).every((n) => Number(n) <= 255);
}

export class TvConnection {
  private ws: WebSocket | null = null;
  private openTimer: ReturnType<typeof setTimeout> | null = null;
  private status: TvStatus = "idle";
  private listeners = new Set<(s: TvStatus) => void>();

  constructor(readonly ip: string) {}

  onStatus(fn: (s: TvStatus) => void): () => void {
    this.listeners.add(fn);
    fn(this.status);
    return () => this.listeners.delete(fn);
  }

  getStatus(): TvStatus {
    return this.status;
  }

  private set(s: TvStatus): void {
    if (s === this.status) return;
    this.status = s;
    this.listeners.forEach((fn) => fn(s));
  }

  connect(): void {
    if (this.ws && (this.status === "connecting" || this.status === "waiting" || this.status === "connected")) return;
    this.close();
    const token = readToken(this.ip);
    const url =
      `wss://${this.ip}:8002/api/v2/channels/samsung.remote.control?name=${b64(CLIENT_NAME)}` +
      (token ? `&token=${encodeURIComponent(token)}` : "");
    this.set("connecting");
    let opened = false;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      this.set("unreachable");
      return;
    }
    this.ws = ws;
    this.openTimer = setTimeout(() => {
      if (!opened && this.ws === ws) {
        ws.close();
        this.set("unreachable");
      }
    }, OPEN_TIMEOUT_MS);

    ws.onopen = () => {
      opened = true;
      if (this.openTimer) clearTimeout(this.openTimer);
      if (this.ws === ws) this.set("waiting");
    };
    ws.onmessage = (ev) => {
      if (this.ws !== ws) return;
      let msg: { event?: string; data?: { token?: string | number } };
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (msg.event === "ms.channel.connect") {
        if (msg.data && msg.data.token) writeToken(this.ip, String(msg.data.token));
        this.set("connected");
      } else if (msg.event === "ms.channel.unauthorized" || msg.event === "ms.channel.timeOut") {
        forgetToken(this.ip);
        this.set("denied");
      }
    };
    ws.onerror = () => {
      if (this.ws === ws && !opened) this.set("unreachable");
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.openTimer) clearTimeout(this.openTimer);
      if (this.status === "connected" || this.status === "waiting" || this.status === "connecting") {
        this.set(opened ? "idle" : "unreachable");
      }
    };
  }

  close(): void {
    if (this.openTimer) clearTimeout(this.openTimer);
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
      try {
        ws.close();
      } catch {
        /* already closed */
      }
    }
    this.set("idle");
  }

  private send(payload: unknown): boolean {
    if (!this.ws || this.status !== "connected" || this.ws.readyState !== WebSocket.OPEN) {
      // Phones suspend sockets in the background; reconnect on the next press.
      if (this.status === "idle") this.connect();
      return false;
    }
    this.ws.send(JSON.stringify(payload));
    return true;
  }

  /** One press of a remote key, e.g. "KEY_UP", "KEY_VOLUP". */
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

  /**
   * Opens an app by its TV application id. The TV doesn't send CORS headers, so this is a
   * fire-and-forget request: the browser can't read the reply, but the TV still acts on it.
   */
  async launch(appId: string): Promise<void> {
    await fetch(`https://${this.ip}:8002/api/v2/applications/${encodeURIComponent(appId)}`, {
      method: "POST",
      mode: "no-cors",
    });
  }
}
