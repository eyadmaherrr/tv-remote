"use client";

import { useState } from "react";
import { certUrl, isValidIp } from "@/lib/tv";

/** First run: find the TV's IP, trust its certificate once, then connect and press Allow. */
export function Setup({ initialIp, onConnect }: { initialIp: string; onConnect: (ip: string) => void }) {
  const [ip, setIp] = useState(initialIp);
  const valid = isValidIp(ip);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-5 pb-10 pt-12">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">TV Remote</h1>
        <p className="mt-2 text-white/60">
          Control your Samsung TV from this phone. Your phone and TV must be on the same Wi-Fi.
        </p>
      </header>

      <Step n={1} title="Enter your TV's IP address">
        <p>
          On the TV: <b>Settings → General → Network → Network Status → IP Settings</b>. It looks like{" "}
          <code>192.168.1.17</code>.
        </p>
        <input
          inputMode="decimal"
          autoComplete="off"
          placeholder="192.168.1.17"
          value={ip}
          onChange={(e) => setIp(e.target.value.trim())}
          className="mt-3 w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-lg outline-none focus:border-white/40"
        />
      </Step>

      <Step n={2} title="Trust the TV (once)">
        <p>
          The TV uses its own security certificate, so your browser has to trust it once. Open the link, tap{" "}
          <b>Advanced → Proceed</b> (or <b>Show details → visit this website</b> on iPhone), then come back here.
        </p>
        <a
          href={valid ? certUrl(ip) : undefined}
          target="_blank"
          rel="noreferrer"
          aria-disabled={!valid}
          className={
            "mt-3 inline-flex rounded-full px-4 py-2 text-sm font-medium " +
            (valid ? "bg-white/15 active:bg-white/25" : "pointer-events-none bg-white/5 text-white/30")
          }
        >
          Open {valid ? ip : "your TV"} ↗
        </a>
        <p className="mt-2 text-sm text-white/45">You&apos;ll see a page of text from the TV — that means it worked.</p>
      </Step>

      <Step n={3} title="Connect and press Allow">
        <p>Your TV will ask to allow &ldquo;Phone Remote&rdquo;. Press <b>Allow</b> with your normal remote.</p>
        <button
          disabled={!valid}
          onClick={() => onConnect(ip)}
          className="mt-3 w-full rounded-2xl bg-white py-3 text-lg font-semibold text-black disabled:bg-white/20 disabled:text-white/40"
        >
          Connect
        </button>
      </Step>
    </main>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 leading-relaxed text-white/80">
      <h2 className="mb-2 flex items-center gap-3 text-lg font-semibold text-white">
        <span className="grid size-7 place-items-center rounded-full bg-white/15 text-sm">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}
