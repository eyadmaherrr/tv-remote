"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { TvConnection, certUrl, forgetToken, isValidIp, type TvStatus } from "@/lib/tv";
import { DEFAULT_APPS, loadCustomApps, loadIp, saveCustomApps, saveIp, type TvApp } from "@/lib/apps";
import { Setup } from "./Setup";
import {
  IconBack, IconClose, IconDown, IconForward, IconGear, IconHome, IconInfo, IconInput, IconKeyboard,
  IconLeft, IconMenu, IconMinus, IconMute, IconNumbers, IconPad, IconPause, IconPlay, IconPlus, IconPower,
  IconRewind, IconRight, IconTouch, IconUp,
} from "./icons";

type Sheet = null | "numbers" | "keyboard" | "settings";

function buzz() {
  try {
    navigator.vibrate?.(8);
  } catch {
    /* no haptics */
  }
}

/** Client-only (see RemoteLoader), so saved settings can be read straight from localStorage. */
export function RemoteApp() {
  const [ip, setIp] = useState(loadIp);
  const [setup, setSetup] = useState(() => !loadIp());

  if (setup || !ip) {
    return (
      <Setup
        initialIp={ip}
        onConnect={(next) => {
          saveIp(next);
          setIp(next);
          setSetup(false);
        }}
      />
    );
  }
  return <Remote key={ip} ip={ip} onSetup={() => setSetup(true)} onIp={(next) => { saveIp(next); setIp(next); }} />;
}

function Remote({ ip, onSetup, onIp }: { ip: string; onSetup: () => void; onIp: (ip: string) => void }) {
  const tv = useMemo(() => new TvConnection(ip), [ip]);
  const [status, setStatus] = useState<TvStatus>("idle");
  const [mode, setMode] = useState<"pad" | "touch">("pad");
  const [sheet, setSheet] = useState<Sheet>(null);
  const [toast, setToast] = useState("");
  const [custom, setCustom] = useState<TvApp[]>(loadCustomApps);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const say = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 1800);
  }, []);

  useEffect(() => {
    const off = tv.onStatus(setStatus);
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

  const press = useCallback(
    (code: string) => {
      buzz();
      if (!tv.key(code) && tv.getStatus() !== "connected") say("Not connected to the TV");
    },
    [tv, say],
  );

  const launch = useCallback(
    (app: TvApp) => {
      buzz();
      say("Opening " + app.name);
      tv.launch(app.id).catch(() => say("Couldn't reach the TV"));
    },
    [tv, say],
  );

  const apps = [...DEFAULT_APPS, ...custom];

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-5 pb-8 pt-6 select-none">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <StatusDot status={status} />
          <div>
            <div className="font-semibold leading-tight">Samsung TV</div>
            <div className="text-xs text-white/50">{ip}</div>
          </div>
        </div>
        <button aria-label="Settings" onClick={() => setSheet("settings")} className="round-btn size-11">
          <IconGear size={22} />
        </button>
      </header>

      <StatusBanner status={status} ip={ip} onRetry={() => tv.connect()} />

      <div className="grid grid-cols-3 gap-3">
        <Key k="KEY_POWER" press={press} className="rounded-2xl bg-red-500/80 py-3 active:bg-red-500" label="Power off">
          <IconPower />
        </Key>
        <Key k="KEY_SOURCE" press={press} className="pill-btn" label="Input">
          <IconInput /> <span className="text-sm">Input</span>
        </Key>
        <Key k="KEY_MENU" press={press} className="pill-btn" label="Settings menu">
          <IconMenu /> <span className="text-sm">Menu</span>
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
          <ModeTab on={mode === "pad"} onClick={() => setMode("pad")}>
            <IconPad size={16} /> D-pad
          </ModeTab>
          <ModeTab on={mode === "touch"} onClick={() => setMode("touch")}>
            <IconTouch size={16} /> Touchpad
          </ModeTab>
        </div>
      </div>

      {mode === "pad" ? <DPad press={press} /> : <TouchPad press={press} />}

      <div className="grid grid-cols-3 gap-3">
        <Key k="KEY_RETURN" press={press} className="pill-btn" label="Back">
          <IconBack /> <span className="text-sm">Back</span>
        </Key>
        <Key k="KEY_HOME" press={press} className="pill-btn" label="Home">
          <IconHome /> <span className="text-sm">Home</span>
        </Key>
        <Key k="KEY_INFO" press={press} className="pill-btn" label="Info">
          <IconInfo /> <span className="text-sm">Info</span>
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

      <div className="grid grid-cols-5 gap-2">
        <Key k="KEY_REWIND" press={press} className="round-btn h-12" label="Rewind"><IconRewind size={20} /></Key>
        <Key k="KEY_PLAY" press={press} className="round-btn h-12" label="Play"><IconPlay size={20} /></Key>
        <Key k="KEY_PAUSE" press={press} className="round-btn h-12" label="Pause"><IconPause size={20} /></Key>
        <Key k="KEY_FF" press={press} className="round-btn h-12" label="Fast forward"><IconForward size={20} /></Key>
        <button aria-label="Keyboard" onClick={() => setSheet("keyboard")} className="round-btn h-12">
          <IconKeyboard size={20} />
        </button>
      </div>

      {sheet === "numbers" ? (
        <SheetPanel title="Numbers" onClose={() => setSheet(null)}>
          <div className="grid grid-cols-3 gap-3">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((n) => (
              <Key key={n} k={"KEY_" + n} press={press} className="num-btn" label={n}>{n}</Key>
            ))}
            <Key k="KEY_CH_LIST" press={press} className="num-btn text-sm" label="Channel list">List</Key>
            <Key k="KEY_0" press={press} className="num-btn" label="0">0</Key>
            <Key k="KEY_ENTER" press={press} className="num-btn text-sm" label="OK">OK</Key>
          </div>
        </SheetPanel>
      ) : null}

      {sheet === "keyboard" ? (
        <KeyboardSheet onClose={() => setSheet(null)} onSend={(t) => (tv.type(t) ? say("Sent to TV") : say("Not connected to the TV"))} press={press} />
      ) : null}

      {sheet === "settings" ? (
        <SettingsSheet
          ip={ip}
          custom={custom}
          onClose={() => setSheet(null)}
          onIp={(next) => { setSheet(null); onIp(next); }}
          onForget={() => { forgetToken(ip); tv.close(); tv.connect(); setSheet(null); say("Press Allow on the TV"); }}
          onSetup={onSetup}
          onCustom={(list) => { setCustom(list); saveCustomApps(list); }}
        />
      ) : null}

      <div
        className={
          "pointer-events-none fixed inset-x-0 bottom-8 mx-auto w-fit rounded-full bg-white px-4 py-2 text-sm font-medium text-black shadow-lg transition-opacity " +
          (toast ? "opacity-100" : "opacity-0")
        }
      >
        {toast}
      </div>
    </main>
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
        if (repeat) timers.current.t = setTimeout(() => (timers.current.i = setInterval(() => press(k), 130)), 400);
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
      className={"flex items-center gap-1.5 rounded-full px-4 py-1.5 " + (on ? "bg-white text-black" : "text-white/70")}
    >
      {children}
    </button>
  );
}

function StatusDot({ status }: { status: TvStatus }) {
  const color =
    status === "connected" ? "bg-emerald-400" : status === "connecting" || status === "waiting" ? "bg-amber-400" : "bg-red-400";
  return <span className={"size-2.5 rounded-full " + color} />;
}

function StatusBanner({ status, ip, onRetry }: { status: TvStatus; ip: string; onRetry: () => void }) {
  if (status === "connected") return null;
  const text =
    status === "connecting" ? "Connecting to the TV…" :
    status === "waiting" ? "Waiting for the TV — if it asks, press Allow with your normal remote." :
    status === "denied" ? "The TV refused the connection (Deny was pressed or the prompt timed out)." :
    status === "unreachable" ? "Can't reach the TV. Check the phone is on the same Wi-Fi, and that you've trusted the TV once." :
    "Disconnected.";
  const showActions = status === "unreachable" || status === "denied" || status === "idle";
  return (
    <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm text-amber-50">
      <p>{text}</p>
      {showActions ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={onRetry} className="rounded-full bg-white px-4 py-1.5 font-medium text-black">
            {status === "denied" ? "Ask again" : "Retry"}
          </button>
          {status === "unreachable" ? (
            <a href={certUrl(ip)} target="_blank" rel="noreferrer" className="rounded-full bg-white/15 px-4 py-1.5 font-medium">
              Trust the TV ↗
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
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
  ip, custom, onClose, onIp, onForget, onSetup, onCustom,
}: {
  ip: string;
  custom: TvApp[];
  onClose: () => void;
  onIp: (ip: string) => void;
  onForget: () => void;
  onSetup: () => void;
  onCustom: (list: TvApp[]) => void;
}) {
  const [nextIp, setNextIp] = useState(ip);
  const [name, setName] = useState("");
  const [id, setId] = useState("");
  return (
    <SheetPanel title="Settings" onClose={onClose}>
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
        The power button can turn the TV off; turning it on from a website isn&apos;t possible (that needs
        Wake-on-LAN). Your TV&apos;s IP and pairing stay in this browser only.
      </p>
    </SheetPanel>
  );
}
