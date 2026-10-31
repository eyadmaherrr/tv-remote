# TV Remote

A phone remote for Samsung Tizen TVs (2016 and newer), as a website. Open it on your phone, connect
once, and control the TV: arrows / OK, a swipe touchpad, back, home, volume, channels, numbers,
play/pause, typing into the TV's keyboard, and one-tap app shortcuts (Clean Home, Quran Play,
YouTube, Netflix, Shahid, WATCH IT, Yango Play, OSN+ — and any app you add).

Companion to [quran-tv-home](https://github.com/eyadmaherrr/quran-tv-home) (the Clean Home launcher
and Quran Play app), but it works on any supported Samsung TV.

## Using it

Your **phone and TV must be on the same Wi-Fi**. The site walks you through this the first time:

1. **Enter the TV's IP address** — on the TV: Settings → General → Network → Network Status → IP
   Settings.
2. **Trust the TV once** — open the link the site gives you (`https://<TV-IP>:8002/api/v2/`), tap
   *Advanced → Proceed* (iPhone: *Show details → visit this website*). You'll see a page of text
   from the TV; go back to the remote.
3. **Connect** — the TV asks to allow "Phone Remote". Press **Allow** with your normal remote.

After that it reconnects on its own. Tip: *Add to Home Screen* makes it open like an app.

Some browsers also ask for permission to **access devices on your local network** — allow it.

## How it works

There's no server involved: the page talks straight from your phone to the TV over your Wi-Fi,
using the remote API built into Samsung TVs.

- Keys and text: WebSocket `wss://<TV-IP>:8002/api/v2/channels/samsung.remote.control`
- App shortcuts: `POST https://<TV-IP>:8002/api/v2/applications/<appId>`

The TV uses a self-signed certificate, which is why you trust it once. The TV's IP and the pairing
token it hands out are stored only in your phone's browser (`localStorage`) — nothing is sent to
this website or anywhere else.

## Limits

- **Power** can turn the TV **off**, not on — turning a TV on needs Wake-on-LAN, which websites can't
  send.
- **iPhone/Safari** may refuse the connection even after trusting the certificate (Safari is strict
  about self-signed certificates for WebSockets). Chrome on Android works best.
- Typing only works while a text field / keyboard is open on the TV.
- App shortcuts use app ids from a 2021 Samsung TV. An id your TV doesn't have does nothing; add
  your own in Settings.

## Development

```bash
npm install
npm run dev      # http://localhost:3000
npm run build
```

Next.js (App Router) + TypeScript + Tailwind CSS. The remote is a client-only component
(`src/components/Remote.tsx`); the TV protocol lives in `src/lib/tv.ts` and the app shortcuts in
`src/lib/apps.ts`. Deployed on Vercel.
