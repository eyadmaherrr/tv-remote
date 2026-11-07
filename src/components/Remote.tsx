"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { TvConnection, certUrl, forgetToken, isValidIp, type TvStatus } from "@/lib/tv";
import { CloudConnection, type CloudStatus } from "@/lib/st/client";
import {
  DEFAULT_APPS, loadCustomApps, loadIp, loadMode, saveCustomApps, saveIp, saveMode, type Mode, type TvApp,
} from "@/lib/apps";
import { Setup } from "./Setup";
import { VoiceButton } from "./Voice";
import type { VoiceAction } from "@/lib/voice/parse";
import {
  IconBack, IconClose, IconDown, IconForward, IconGear, IconHome, IconInput, IconKeyboard,
  IconLeft, IconMenu, IconMinus, IconMute, IconNumbers, IconPad, IconPause, IconPlay, IconPlus, IconPower,
  IconRewind, IconRight, IconTouch, IconUp,
} from "./icons";

type Sheet = null | "numbers" | "keyboard" | "settings";

/** Hold-to-repeat interval: fast on Wi-Fi, gentler through SmartThings (each press is a web request). */
const RepeatRate = createContext(130);

function buzz() {
  try {
    navigator.vibrate?.(8);
  } catch {
    /* no haptics */
  }
}

/** ?st=ok / ?st=<error> after coming back from SmartThings sign-in. */
function readSignInResult(): string {
  try {
    return new URL(window.location.href).searchParams.get("st") || "";
  } catch {
    return "";
  }
}

/** Client-only (see RemoteLoader), so saved settings can be read straight from localStorage. */
export function RemoteApp() {
  const [signIn] = useState(readSignInResult);
  const [mode, setMode] = useState<Mode>(() => (signIn ? "cloud" : loadMode()));
  const [ip, setIp] = useState(loadIp);
  const [setup, setSetup] = useState(() => mode === "wifi" && !loadIp());

  useEffect(() => {
    if (signIn) {
      saveMode("cloud");
      window.history.replaceState(null, "", "/");
    }
  }, [signIn]);

  const switchMode = (next: Mode) => {
    saveMode(next);
    setMode(next);
    if (next === "wifi" && !ip) setSetup(true);
  };

  if (setup) {
    return (
      <Setup
        initialIp={ip}
        onConnect={(next) => {
          saveIp(next);
          saveMode("wifi");
          setIp(next);
          setMode("wifi");
          setSetup(false);
        }}
        onCloud={() => {
          saveMode("cloud");
          setMode("cloud");
          setSetup(false);
        }}
      />
    );
  }
  return (
    <Remote
      key={mode + ip}
      mode={mode}
      ip={ip}
      signIn={signIn}
      onMode={switchMode}
      onSetup={() => setSetup(true)}
      onIp={(next) => {
        saveIp(next);
        setIp(next);
      }}
    />
  );
}

function Remote({
  mode, ip, signIn, onMode, onSetup, onIp,
}: {
  mode: Mode;
  ip: string;
  signIn: string;
  onMode: (m: Mode) => void;
  onSetup: () => void;
  onIp: (ip: string) => void;
}) {
  const cloudMode = mode === "cloud";
  const tv = useMemo(() => (cloudMode ? null : new TvConnection(ip)), [cloudMode, ip]);
  const cloud = useMemo(() => (cloudMode ? new CloudConnection() : null), [cloudMode]);
  const [wifiStatus, setWifiStatus] = useState<TvStatus>("idle");
  const [cloudStatus, setCloudStatus] = useState<CloudStatus>("checking");
  const [pad, setPad] = useState<"pad" | "touch">("pad");
  const [sheet, setSheet] = useState<Sheet>(null);
  const [toast, setToast] = useState(signIn && signIn !== "ok" ? "Sign-in failed: " + signIn : "");
  const [custom, setCustom] = useState<TvApp[]>(loadCustomApps);
  const [tvs, setTvs] = useState<{ id: string; name: string }[]>([]);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const say = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2200);
  }, []);

  // Direct Wi-Fi connection.
  useEffect(() => {
    if (!tv) return;
    const off = tv.onStatus(setWifiStatus);
    tv.connect();
    // Phones drop sockets in the background; reconnect when the page is shown again.
    const onVisible = () => {
      if (document.visibilityState === "visible" && tv.getStatus() !== "connected") tv.connect();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      off();
      document.removeEventListener("visibilitychange", onVisible);
      tv.close();
    };
  }, [tv]);

  // SmartThings connection.
  useEffect(() => {
    if (!cloud) return;
    const off = cloud.onStatus((s) => {
      setCloudStatus(s);
      setTvs(cloud.tvs.slice());
    });
    cloud.init();
    return off;
  }, [cloud]);

  const press = useCallback(
    (code: string) => {
      buzz();
      if (cloud) {
        if (!cloud.supports(code)) {
          say("Not available in SmartThings mode");
          return;
        }
        if (cloud.getStatus() !== "connected") {
          say("Not connected to SmartThings");
          return;
        }
        cloud.key(code).then((ok) => {
          if (!ok) say("The TV didn't respond");
        });
        return;
      }
      if (tv && !tv.key(code) && tv.getStatus() !== "connected") say("Not connected to the TV");
    },
    [tv, cloud, say],
  );

  const launch = useCallback(
    (app: TvApp) => {
      buzz();
      say("Opening " + app.name);
      if (cloud) {
        cloud.launch(app.id, app.name).then((ok) => {
          if (!ok) say("Couldn't open " + app.name);
        });
      } else if (tv) {
        tv.launch(app.id).catch(() => say("Couldn't reach the TV"));
      }
    },
    [tv, cloud, say],
  );

  const apps = useMemo(() => [...DEFAULT_APPS, ...custom], [custom]);

  /** Runs spoken commands in order; repeats ("volume up 3") are spaced like real presses. */
  const runVoice = useCallback(
    (actions: VoiceAction[]) => {
      const gap = cloudMode ? 650 : 220;
      let at = 0;
      const later = (fn: () => void) => {
        setTimeout(fn, at);
        at += gap;
      };
      for (const a of actions) {
        if (a.type === "launch") {
          const app = apps.find((x) => x.id === a.appId);
          if (app) later(() => launch(app));
        } else if (a.type === "power") {
          if (a.on && !cloudMode) say("Turning the TV on needs SmartThings mode");
          else later(() => press(a.on ? "KEY_POWERON" : "KEY_POWER"));
        } else {
          for (let i = 0; i < a.times; i++) later(() => press(a.code));
        }
        at += gap; // a little extra between different commands (e.g. after opening an app)
      }
    },
    [apps, cloudMode, launch, press, say],
  );

  const connected = cloudMode ? cloudStatus === "connected" : wifiStatus === "connected";
  const pending = cloudMode ? cloudStatus === "checking" : wifiStatus === "connecting" || wifiStatus === "waiting";
  const tvName = cloudMode ? (tvs.find((t) => t.id === cloud?.deviceId)?.name || "SmartThings") : "Samsung TV";

  return (
    <RepeatRate.Provider value={cloudMode ? 450 : 130}>
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-5 pb-28 pt-6 select-none">
        <header className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className={"size-2.5 shrink-0 rounded-full " + (connected ? "bg-emerald-400" : pending ? "bg-amber-400" : "bg-red-400")} />
            <div className="min-w-0">
              <div className="truncate font-semibold leading-tight">{tvName}</div>
              <div className="text-xs text-white/50">{cloudMode ? "via SmartThings" : ip}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-full bg-white/[0.07] p-1 text-xs">
              <ModeTab on={!cloudMode} onClick={() => onMode("wifi")}>Wi-Fi</ModeTab>
              <ModeTab on={cloudMode} onClick={() => onMode("cloud")}>SmartThings</ModeTab>
            </div>
            <button aria-label="Settings" onClick={() => setSheet("settings")} className="round-btn size-10">
              <IconGear size={20} />
            </button>
          </div>
        </header>

        {cloudMode ? (
          <CloudBanner status={cloudStatus} onRetry={() => cloud?.init()} />
        ) : (
          <WifiBanner status={wifiStatus} ip={ip} onRetry={() => tv?.connect()} onCloud={() => onMode("cloud")} />
        )}

        <div className={"grid gap-3 " + (cloudMode ? "grid-cols-4" : "grid-cols-3")}>
          <Key k="KEY_POWER" press={press} className="rounded-2xl bg-red-500/80 py-3 active:bg-red-500" label="Power off">
            <IconPower /> {cloudMode ? <span className="text-sm">Off</span> : null}
          </Key>
          {cloudMode ? (
            <Key k="KEY_POWERON" press={press} className="rounded-2xl bg-emerald-500/70 py-3 active:bg-emerald-500" label="Power on">
              <IconPower /> <span className="text-sm">On</span>
            </Key>
          ) : null}
          <Key k="KEY_SOURCE" press={press} className="pill-btn" label="Input">
            <IconInput /> {cloudMode ? null : <span className="text-sm">Input</span>}
          </Key>
          <Key k="KEY_MENU" press={press} className="pill-btn" label="Settings menu">
            <IconMenu /> {cloudMode ? null : <span className="text-sm">Menu</span>}
          </Key>
        </div>

        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
          {apps.map((app) => (
            <button
              key={app.id}
              onClick={() => launch(app)}
              className="shrink-0 rounded-full border border-white/10 bg-white/[0.07] px-4 py-2 text-sm font-medium active:bg-white/20"
            >
              {app.name}
            </button>
          ))}
        </div>

        <div className="flex justify-center">
          <div className="flex rounded-full bg-white/[0.07] p-1 text-sm">
            <ModeTab on={pad === "pad"} onClick={() => setPad("pad")}>
              <IconPad size={16} /> D-pad
            </ModeTab>
            <ModeTab on={pad === "touch"} onClick={() => setPad("touch")}>
              <IconTouch size={16} /> Touchpad
            </ModeTab>
          </div>
        </div>

        {pad === "pad" ? <DPad press={press} /> : <TouchPad press={press} />}

        <div className="grid grid-cols-3 gap-3">
          <Key k="KEY_RETURN" press={press} className="pill-btn" label="Back">
            <IconBack /> <span className="text-sm">Back</span>
          </Key>
          <Key k="KEY_HOME" press={press} className="pill-btn" label="Home">
            <IconHome /> <span className="text-sm">Home</span>
          </Key>
          <Key k="KEY_EXIT" press={press} className="pill-btn" label="Exit">
            <IconClose /> <span className="text-sm">Exit</span>
          </Key>
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-3">
          <Rocker
            label="VOL"
            up={<Key k="KEY_VOLUP" press={press} repeat className="rocker-btn" label="Volume up"><IconPlus /></Key>}
            down={<Key k="KEY_VOLDOWN" press={press} repeat className="rocker-btn" label="Volume down"><IconMinus /></Key>}
          />
          <div className="flex flex-col justify-between gap-3">
            <Key k="KEY_MUTE" press={press} className="round-btn size-14" label="Mute">
              <IconMute />
            </Key>
            <button aria-label="Number pad" onClick={() => setSheet("numbers")} className="round-btn size-14">
              <IconNumbers />
            </button>
          </div>
          <Rocker
            label="CH"
            up={<Key k="KEY_CHUP" press={press} repeat className="rocker-btn" label="Channel up"><IconUp /></Key>}
            down={<Key k="KEY_CHDOWN" press={press} repeat className="rocker-btn" label="Channel down"><IconDown /></Key>}
          />
        </div>

        <div className={"grid gap-2 " + (cloudMode ? "grid-cols-4" : "grid-cols-5")}>
          <Key k="KEY_REWIND" press={press} className="round-btn h-12" label="Rewind"><IconRewind size={20} /></Key>
          <Key k="KEY_PLAY" press={press} className="round-btn h-12" label="Play"><IconPlay size={20} /></Key>
          <Key k="KEY_PAUSE" press={press} className="round-btn h-12" label="Pause"><IconPause size={20} /></Key>
          <Key k="KEY_FF" press={press} className="round-btn h-12" label="Fast forward"><IconForward size={20} /></Key>
          {cloudMode ? null : (
            <button aria-label="Keyboard" onClick={() => setSheet("keyboard")} className="round-btn h-12">
              <IconKeyboard size={20} />
            </button>
          )}
        </div>

        {sheet === "numbers" ? (
          <SheetPanel title="Numbers" onClose={() => setSheet(null)}>
            <div className="grid grid-cols-3 gap-3">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((n) => (
                <Key key={n} k={"KEY_" + n} press={press} className="num-btn" label={n}>{n}</Key>
              ))}
              <Key k="KEY_RETURN" press={press} className="num-btn text-sm" label="Back">Back</Key>
              <Key k="KEY_0" press={press} className="num-btn" label="0">0</Key>
              <Key k="KEY_ENTER" press={press} className="num-btn text-sm" label="OK">OK</Key>
            </div>
          </SheetPanel>
        ) : null}

        {sheet === "keyboard" && tv ? (
          <KeyboardSheet onClose={() => setSheet(null)} onSend={(t) => (tv.type(t) ? say("Sent to TV") : say("Not connected to the TV"))} press={press} />
        ) : null}

        {sheet === "settings" ? (
          <SettingsSheet
            mode={mode}
            ip={ip}
            custom={custom}
            tvs={tvs}
            tvId={cloud?.deviceId || ""}
            onClose={() => setSheet(null)}
            onIp={(next) => { setSheet(null); onIp(next); }}
            onForget={() => { forgetToken(ip); tv?.close(); tv?.connect(); setSheet(null); say("Press Allow on the TV if it asks"); }}
            onSetup={onSetup}
            onTv={(id) => { cloud?.chooseTv(id); setTvs(cloud ? cloud.tvs.slice() : []); setSheet(null); }}
            onSignOut={() => { cloud?.signOut(); setSheet(null); }}
            onCustom={(list) => { setCustom(list); saveCustomApps(list); }}
          />
        ) : null}

        <VoiceButton apps={apps} run={runVoice} />

        <div
          className={
            "pointer-events-none fixed inset-x-0 bottom-8 mx-auto w-fit max-w-[90vw] rounded-full bg-white px-4 py-2 text-center text-sm font-medium text-black shadow-lg transition-opacity " +
            (toast ? "opacity-100" : "opacity-0")
          }
        >
          {toast}
        </div>
      </main>
    </RepeatRate.Provider>
  );
}

/* ------------------------------------------------------------------ pieces */

function Key({
  k, press, repeat, className, label, children,
}: {
  k: string;
  press: (code: string) => void;
  repeat?: boolean;
  className?: string;
  label: string;
  children: ReactNode;
}) {
  const rate = useContext(RepeatRate);
  const timers = useRef<{ t?: ReturnType<typeof setTimeout>; i?: ReturnType<typeof setInterval> }>({});
  const stop = () => {
    if (timers.current.t) clearTimeout(timers.current.t);
    if (timers.current.i) clearInterval(timers.current.i);
    timers.current = {};
  };
  useEffect(() => stop, []);
  return (
    <button
      aria-label={label}
      className={"flex items-center justify-center gap-2 " + (className || "")}
      onPointerDown={(e) => {
        e.preventDefault();
        press(k);
        // Held volume / channel / arrows keep going, like a real remote.
        if (repeat) timers.current.t = setTimeout(() => (timers.current.i = setInterval(() => press(k), rate)), 400);
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );
}

function DPad({ press }: { press: (code: string) => void }) {
  return (
    <div className="relative mx-auto size-64 rounded-full border border-white/10 bg-white/[0.06]">
      <Key k="KEY_UP" press={press} repeat label="Up" className="absolute left-1/2 top-2 h-20 w-24 -translate-x-1/2 rounded-full active:bg-white/15">
        <IconUp size={30} />
      </Key>
      <Key k="KEY_DOWN" press={press} repeat label="Down" className="absolute bottom-2 left-1/2 h-20 w-24 -translate-x-1/2 rounded-full active:bg-white/15">
        <IconDown size={30} />
      </Key>
      <Key k="KEY_LEFT" press={press} repeat label="Left" className="absolute left-2 top-1/2 h-24 w-20 -translate-y-1/2 rounded-full active:bg-white/15">
        <IconLeft size={30} />
      </Key>
      <Key k="KEY_RIGHT" press={press} repeat label="Right" className="absolute right-2 top-1/2 h-24 w-20 -translate-y-1/2 rounded-full active:bg-white/15">
        <IconRight size={30} />
      </Key>
      <Key k="KEY_ENTER" press={press} label="OK" className="absolute left-1/2 top-1/2 size-24 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/15 text-lg font-semibold active:bg-white/30">
        OK
      </Key>
    </div>
  );
}

/** Swipe to move (keep dragging to keep moving), tap for OK. */
function TouchPad({ press }: { press: (code: string) => void }) {
  const start = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const STEP = 44;
  return (
    <div
      className="mx-auto flex h-64 w-full touch-none items-center justify-center rounded-3xl border border-white/10 bg-white/[0.06] text-sm text-white/40"
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        start.current = { x: e.clientX, y: e.clientY, moved: false };
      }}
      onPointerMove={(e) => {
        const s = start.current;
        if (!s) return;
        const dx = e.clientX - s.x;
        const dy = e.clientY - s.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < STEP) return;
        if (Math.abs(dx) > Math.abs(dy)) press(dx > 0 ? "KEY_RIGHT" : "KEY_LEFT");
        else press(dy > 0 ? "KEY_DOWN" : "KEY_UP");
        start.current = { x: e.clientX, y: e.clientY, moved: true };
      }}
      onPointerUp={() => {
        if (start.current && !start.current.moved) press("KEY_ENTER");
        start.current = null;
      }}
      onPointerCancel={() => (start.current = null)}
    >
      Swipe to move · Tap for OK
    </div>
  );
}

function Rocker({ label, up, down }: { label: string; up: ReactNode; down: ReactNode }) {
  return (
    <div className="flex flex-col items-stretch overflow-hidden rounded-full border border-white/10 bg-white/[0.06]">
      {up}
      <div className="py-1 text-center text-xs font-semibold tracking-widest text-white/50">{label}</div>
      {down}
    </div>
  );
}

function ModeTab({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={"flex items-center gap-1.5 rounded-full px-3 py-1.5 " + (on ? "bg-white text-black" : "text-white/70")}
    >
      {children}
    </button>
  );
}

function Banner({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm text-amber-50">
      <p>{children}</p>
      {actions ? <div className="mt-3 flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

const primaryBtn = "rounded-full bg-white px-4 py-1.5 font-medium text-black";
const secondaryBtn = "rounded-full bg-white/15 px-4 py-1.5 font-medium";

function WifiBanner({ status, ip, onRetry, onCloud }: { status: TvStatus; ip: string; onRetry: () => void; onCloud: () => void }) {
  if (status === "connected") return null;
  if (status === "connecting") return <Banner>Connecting to the TV…</Banner>;
  if (status === "waiting") return <Banner>Waiting for the TV — if it asks, press Allow with your normal remote.</Banner>;
  if (status === "denied") {
    return (
      <Banner actions={<button onClick={onRetry} className={primaryBtn}>Ask again</button>}>
        The TV refused the connection (Deny was pressed or the prompt timed out).
      </Banner>
    );
  }
  return (
    <Banner
      actions={
        <>
          <button onClick={onRetry} className={primaryBtn}>Retry</button>
          {status === "unreachable" ? (
            <a href={certUrl(ip)} target="_blank" rel="noreferrer" className={secondaryBtn}>Trust the TV ↗</a>
          ) : null}
          <button onClick={onCloud} className={secondaryBtn}>Use SmartThings</button>
        </>
      }
    >
      {status === "unreachable"
        ? "Can't reach the TV. Check you're on the same Wi-Fi and have trusted the TV once. On iPhone, use SmartThings instead."
        : "Disconnected."}
    </Banner>
  );
}

function CloudBanner({ status, onRetry }: { status: CloudStatus; onRetry: () => void }) {
  if (status === "connected") return null;
  if (status === "checking") return <Banner>Checking SmartThings…</Banner>;
  if (status === "not-configured") return <Banner>SmartThings isn&apos;t set up on this site yet.</Banner>;
  if (status === "signed-out") {
    return (
      <Banner actions={<a href="/api/st/login" className={primaryBtn}>Sign in with Samsung</a>}>
        Sign in with your Samsung account to control your TV through SmartThings.
      </Banner>
    );
  }
  if (status === "no-tv") {
    return (
      <Banner actions={<button onClick={onRetry} className={primaryBtn}>Retry</button>}>
        No TV in your SmartThings account. In the SmartThings app, tap + → Device → TV (with the TV on), then Retry.
      </Banner>
    );
  }
  return (
    <Banner actions={<button onClick={onRetry} className={primaryBtn}>Retry</button>}>
      Couldn&apos;t reach SmartThings.
    </Banner>
  );
}

function SheetPanel({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-20 flex items-end bg-black/60" onClick={onClose}>
      <div
        className="mx-auto max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-white/10 bg-neutral-900 p-5 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button aria-label="Close" onClick={onClose} className="round-btn size-9">
            <IconClose size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function KeyboardSheet({ onClose, onSend, press }: { onClose: () => void; onSend: (t: string) => void; press: (k: string) => void }) {
  const [text, setText] = useState("");
  return (
    <SheetPanel title="Type on the TV" onClose={onClose}>
      <p className="mb-3 text-sm text-white/60">
        First open a search box on the TV so its keyboard is showing, then type here.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (text) onSend(text);
        }}
        className="flex gap-2"
      >
        <input
          autoFocus
          dir="auto"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search…"
          className="min-w-0 flex-1 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 outline-none focus:border-white/40"
        />
        <button className="rounded-2xl bg-white px-5 font-semibold text-black">Send</button>
      </form>
      <div className="mt-3 flex gap-2">
        <button onClick={() => press("KEY_ENTER")} className="pill-btn flex-1">Enter</button>
        <button onClick={() => { setText(""); press("KEY_RETURN"); }} className="pill-btn flex-1">Close keyboard</button>
      </div>
    </SheetPanel>
  );
}

function SettingsSheet({
  mode, ip, custom, tvs, tvId, onClose, onIp, onForget, onSetup, onTv, onSignOut, onCustom,
}: {
  mode: Mode;
  ip: string;
  custom: TvApp[];
  tvs: { id: string; name: string }[];
  tvId: string;
  onClose: () => void;
  onIp: (ip: string) => void;
  onForget: () => void;
  onSetup: () => void;
  onTv: (id: string) => void;
  onSignOut: () => void;
  onCustom: (list: TvApp[]) => void;
}) {
  const [nextIp, setNextIp] = useState(ip);
  const [name, setName] = useState("");
  const [id, setId] = useState("");
  return (
    <SheetPanel title="Settings" onClose={onClose}>
      {mode === "wifi" ? (
        <section className="space-y-3">
          <label className="block text-sm text-white/60">TV IP address</label>
          <div className="flex gap-2">
            <input
              inputMode="decimal"
              value={nextIp}
              onChange={(e) => setNextIp(e.target.value.trim())}
              className="min-w-0 flex-1 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 outline-none focus:border-white/40"
            />
            <button
              disabled={!isValidIp(nextIp) || nextIp === ip}
              onClick={() => onIp(nextIp)}
              className="rounded-2xl bg-white px-4 font-semibold text-black disabled:bg-white/20 disabled:text-white/40"
            >
              Save
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={certUrl(ip)} target="_blank" rel="noreferrer" className="pill-btn px-4">Trust the TV ↗</a>
            <button onClick={onForget} className="pill-btn px-4">Pair again</button>
            <button onClick={onSetup} className="pill-btn px-4">Setup guide</button>
          </div>
        </section>
      ) : (
        <section className="space-y-3">
          <h3 className="font-semibold">SmartThings TV</h3>
          {tvs.length ? (
            tvs.map((t) => (
              <button
                key={t.id}
                onClick={() => onTv(t.id)}
                className={"flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left " + (t.id === tvId ? "bg-white text-black" : "bg-white/5")}
              >
                {t.name}
                {t.id === tvId ? <span className="text-xs font-semibold">IN USE</span> : null}
              </button>
            ))
          ) : (
            <p className="text-sm text-white/60">No TVs found yet.</p>
          )}
          <button onClick={onSignOut} className="pill-btn px-4">Sign out of SmartThings</button>
        </section>
      )}

      <section className="mt-6 space-y-3">
        <h3 className="font-semibold">Your app shortcuts</h3>
        <p className="text-sm text-white/60">
          Add any app by its TV app id (for example <code>3201907018807</code> is Netflix).
        </p>
        {custom.map((a) => (
          <div key={a.id} className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-2">
            <div>
              <div className="font-medium">{a.name}</div>
              <div className="text-xs text-white/50">{a.id}</div>
            </div>
            <button aria-label={"Remove " + a.name} onClick={() => onCustom(custom.filter((x) => x.id !== a.id))} className="round-btn size-8">
              <IconClose size={16} />
            </button>
          </div>
        ))}
        <div className="flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="w-1/3 rounded-2xl border border-white/15 bg-white/5 px-3 py-2 outline-none" />
          <input value={id} onChange={(e) => setId(e.target.value.trim())} placeholder="App id" className="min-w-0 flex-1 rounded-2xl border border-white/15 bg-white/5 px-3 py-2 outline-none" />
          <button
            disabled={!name || !id}
            onClick={() => { onCustom([...custom, { id, name, custom: true }]); setName(""); setId(""); }}
            className="rounded-2xl bg-white px-3 font-semibold text-black disabled:bg-white/20 disabled:text-white/40"
          >
            Add
          </button>
        </div>
      </section>

      <p className="mt-6 text-xs leading-relaxed text-white/40">
        {mode === "wifi"
          ? "On Wi-Fi the power button can turn the TV off but not on — switch to SmartThings to turn it on. "
          : "SmartThings mode can't type into the TV's keyboard (SmartThings doesn't offer it), and each press takes a moment. "}
        Your TV&apos;s IP and pairing stay in this browser; SmartThings sign-in is kept in an encrypted cookie.
      </p>
    </SheetPanel>
  );
}
