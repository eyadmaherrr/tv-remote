"use client";

import { useEffect, useRef, useState } from "react";
import { parseVoice, type VoiceAction, type VoiceApp } from "@/lib/voice/parse";

/* The Web Speech API isn't in TypeScript's DOM types under these names; just what's used. */
interface Recognition {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  start(): void;
  abort(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

type Lang = "en-US" | "ar-EG";
const LANG_KEY = "tv.voice.lang";

function loadLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === "en-US" || saved === "ar-EG") return saved;
  } catch {
    /* ignore */
  }
  return navigator.language.toLowerCase().startsWith("ar") ? "ar-EG" : "en-US";
}

const EXAMPLES: Record<Lang, string[]> = {
  "en-US": ["Open YouTube", "Turn off the TV", "Go back", "Volume up 3", "Open Netflix and turn the volume down", "Go home"],
  "ar-EG": ["افتح يوتيوب", "اقفل التلفزيون", "ارجع", "ارفع الصوت ٣ مرات", "افتح القرآن", "وطي الصوت"],
};

function describe(a: VoiceAction): string {
  if (a.type === "launch") return "Opening " + a.name;
  if (a.type === "power") return a.on ? "Turning the TV on" : "Turning the TV off";
  return a.label + (a.times > 1 ? " ×" + a.times : "");
}

/**
 * Hold-free voice commands: tap the mic, say a command, and it runs. Uses the phone's own
 * speech recognition (Google's in Chrome, Apple's in Safari), so there's no account or key.
 */
export function VoiceButton({ apps, run }: { apps: VoiceApp[]; run: (actions: VoiceAction[]) => void }) {
  const [supported] = useState(() => !!recognitionCtor());
  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const [result, setResult] = useState("");
  const [lang, setLang] = useState<Lang>(loadLang);
  const rec = useRef<Recognition | null>(null);

  useEffect(() => () => rec.current?.abort(), []);

  const listen = (language: Lang = lang) => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    rec.current?.abort();
    const r = new Ctor();
    r.lang = language;
    r.interimResults = true;
    r.maxAlternatives = 3;
    r.continuous = false;
    let done = false;
    r.onresult = (e) => {
      const last = e.results[e.results.length - 1];
      setHeard(last[0].transcript);
      if (!last.isFinal || done) return;
      done = true;
      // Try each alternative the recogniser offers until one is a command.
      for (let i = 0; i < last.length; i++) {
        const actions = parseVoice(last[i].transcript, apps);
        if (actions.length) {
          setHeard(last[i].transcript);
          setResult(actions.map(describe).join(" · "));
          run(actions);
          setTimeout(() => setOpen(false), 1400);
          return;
        }
      }
      setResult(language === "ar-EG" ? "مفهمتش الأمر — جرب تاني" : "That's not a command I know — try again");
    };
    r.onerror = (e) => {
      setListening(false);
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setResult("Microphone blocked — allow it for this site in your browser settings.");
      } else if (e.error === "no-speech") {
        setResult(language === "ar-EG" ? "مسمعتش حاجة" : "Didn't hear anything");
      } else if (e.error !== "aborted") {
        setResult("Voice error: " + e.error);
      }
    };
    r.onend = () => setListening(false);
    rec.current = r;
    setHeard("");
    setResult("");
    setListening(true);
    try {
      r.start();
    } catch {
      setListening(false);
    }
  };

  const switchLang = (next: Lang) => {
    setLang(next);
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch {
      /* ignore */
    }
    listen(next);
  };

  if (!supported) return null;

  return (
    <>
      <button
        aria-label="Voice command"
        onClick={() => {
          setOpen(true);
          listen();
        }}
        className="fixed bottom-6 right-5 z-10 grid size-16 place-items-center rounded-full bg-white text-black shadow-[0_8px_30px_rgba(0,0,0,0.5)] active:scale-95"
      >
        <MicIcon />
      </button>

      {open ? (
        <div className="fixed inset-0 z-30 flex items-end bg-black/70" onClick={() => { rec.current?.abort(); setOpen(false); }}>
          <div
            className="mx-auto w-full max-w-md rounded-t-3xl border border-white/10 bg-neutral-900 p-6 pb-10 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex justify-center">
              <div className="flex rounded-full bg-white/[0.07] p-1 text-sm">
                <LangTab on={lang === "en-US"} onClick={() => switchLang("en-US")}>English</LangTab>
                <LangTab on={lang === "ar-EG"} onClick={() => switchLang("ar-EG")}>عربي</LangTab>
              </div>
            </div>

            <button
              aria-label={listening ? "Listening" : "Listen again"}
              onClick={() => (listening ? rec.current?.abort() : listen())}
              className={
                "mx-auto grid size-24 place-items-center rounded-full " +
                (listening ? "animate-pulse bg-red-500 text-white" : "bg-white text-black")
              }
            >
              <MicIcon size={40} />
            </button>

            <p className="mt-4 min-h-7 text-xl font-medium" dir="auto">
              {heard || (listening ? (lang === "ar-EG" ? "بسمعك…" : "Listening…") : "")}
            </p>
            <p className="mt-1 min-h-6 text-white/70" dir="auto">
              {result || (!listening && !heard ? (lang === "ar-EG" ? "دوس على المايك واتكلم" : "Tap the mic and speak") : "")}
            </p>

            <div className="mt-5 flex flex-wrap justify-center gap-2 text-sm text-white/60" dir="auto">
              {EXAMPLES[lang].map((ex) => (
                <span key={ex} className="rounded-full bg-white/[0.06] px-3 py-1">&ldquo;{ex}&rdquo;</span>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function LangTab({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={"rounded-full px-4 py-1.5 " + (on ? "bg-white text-black" : "text-white/70")}>
      {children}
    </button>
  );
}

function MicIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6" />
    </svg>
  );
}
