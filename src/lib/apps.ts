/** App shortcuts. Ids are Tizen application ids as the TV's REST API knows them. */
export interface TvApp {
  id: string;
  name: string;
  /** Added by the user in Settings (removable). */
  custom?: boolean;
}

/** Checked against a 2021 Samsung TV; any id the TV doesn't have just does nothing. */
export const DEFAULT_APPS: TvApp[] = [
  { id: "tvunlock02.Launcher", name: "Clean Home" },
  { id: "QuranPlay1.QuranPlay", name: "Quran Play" },
  { id: "111299001912", name: "YouTube" },
  { id: "3201907018807", name: "Netflix" },
  { id: "Ggl33q588H.MBC", name: "Shahid" },
  { id: "J5PGJgxrjt.WatchIT", name: "WATCH IT" },
  { id: "yvoS9TN5KY.YangoSpark", name: "Yango Play" },
  { id: "BlDC3WXVuw.sample", name: "OSN+" },
];

/** "wifi": straight to the TV on the local network. "cloud": through SmartThings. */
export type Mode = "wifi" | "cloud";

const MODE_KEY = "tv.mode";

export function loadMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === "cloud" ? "cloud" : "wifi";
  } catch {
    return "wifi";
  }
}

export function saveMode(mode: Mode): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}

const IP_KEY = "tv.ip";
const APPS_KEY = "tv.apps.custom";

export function loadIp(): string {
  try {
    return localStorage.getItem(IP_KEY) || "";
  } catch {
    return "";
  }
}

export function saveIp(ip: string): void {
  try {
    localStorage.setItem(IP_KEY, ip);
  } catch {
    /* ignore */
  }
}

export function loadCustomApps(): TvApp[] {
  try {
    const raw = localStorage.getItem(APPS_KEY);
    const list = raw ? (JSON.parse(raw) as TvApp[]) : [];
    return Array.isArray(list) ? list.filter((a) => a && a.id && a.name).map((a) => ({ ...a, custom: true })) : [];
  } catch {
    return [];
  }
}

export function saveCustomApps(apps: TvApp[]): void {
  try {
    localStorage.setItem(APPS_KEY, JSON.stringify(apps.map(({ id, name }) => ({ id, name }))));
  } catch {
    /* ignore */
  }
}
