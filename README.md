# TV Remote

A phone remote for Samsung Tizen TVs (2016 and newer), as a website. Open it on your phone, connect
once, and control the TV: arrows / OK, a swipe touchpad, back, home, volume, channels, numbers,
play/pause, typing into the TV's keyboard, and one-tap app shortcuts (Clean Home, Quran Play,
YouTube, Netflix, Shahid, WATCH IT, Yango Play, OSN+ — and any app you add).

Companion to [quran-tv-home](https://github.com/eyadmaherrr/quran-tv-home) (the Clean Home launcher
and Quran Play app), but it works on any supported Samsung TV.

## Voice commands

Tap the round mic button and speak, in English or Arabic:

| Say | Does |
|---|---|
| "Open YouTube" / "افتح يوتيوب" (any app shortcut) | Opens the app |
| "Close YouTube" / "اقفل يوتيوب" | Leaves the app |
| "Turn off the TV" / "اقفل التلفزيون" | Power off |
| "Turn on the TV" / "شغل التلفزيون" | Power on (SmartThings mode) |
| "Go back" / "ارجع" · "Go home" (Clean Home) · "Exit" | Navigation |
| "Volume up 3" / "ارفع الصوت ٣ مرات" · "Mute" / "اكتم الصوت" | Volume |
| "Go down", "Left", "OK", "Pause", "Play", "Next channel" | Remote keys |
| "Open Netflix and turn the volume down" | Chained commands |

It uses the phone's own speech recognition (Google's in Chrome, Apple's in Safari), so there's no
account or key. Commands are matched by `src/lib/voice/parse.ts`.

## Two ways to connect

| | **Wi-Fi** (direct) | **SmartThings** (cloud) |
|---|---|---|
| Works on | Android, laptops | **iPhone**, Android, laptops |
| Where | Same Wi-Fi as the TV | Anywhere |
| Speed | Instant | About half a second per press |
| Turn TV **on** | No | Yes |
| Type into the TV | Yes | No |
| Setup | TV's IP + trust it once + Allow | Sign in with your Samsung account |

**iPhones must use SmartThings.** The TV's direct connection uses a certificate that's only valid
for `127.0.0.1`, which Safari refuses, and the TV rejects the unencrypted port.

### SmartThings

1. Add your TV in the SmartThings app (**+ → Device → TV**, TV switched on).
2. On the site, choose **Use SmartThings** and sign in with the same Samsung account.

Sign-in is OAuth through a SmartThings "OAuth-In" app. The tokens (24 h access, 29-day rotating
refresh) are kept in an encrypted, httpOnly cookie on your phone — no database. The server only
forwards TV-remote commands (`samsungvd.remoteControl`, `switch`, `custom.launchapp`).

### Wi-Fi

Your **phone and TV must be on the same Wi-Fi**. The site walks you through this the first time:

1. **Enter the TV's IP address** — on the TV: Settings → General → Network → Network Status → IP
   Settings.
2. **Trust the TV once** — open the link the site gives you (`https://<TV-IP>:8002/api/v2/`), tap
   *Advanced → Proceed* (iPhone: *Show details → visit this website*). You'll see a page of text
   from the TV; go back to the remote.
3. **Connect** — the TV asks to allow "Phone Remote". Press **Allow** with your normal remote.

After that it reconnects on its own. Tip: *Add to Home Screen* makes it open like an app.

Some browsers also ask for permission to **access devices on your local network** — allow it.

## How Wi-Fi mode works

There's no server involved: the page talks straight from your phone to the TV over your Wi-Fi,
using the remote API built into Samsung TVs.

- Keys and text: WebSocket `wss://<TV-IP>:8002/api/v2/channels/samsung.remote.control`
- App shortcuts: `POST https://<TV-IP>:8002/api/v2/applications/<appId>`

The TV uses a self-signed certificate, which is why you trust it once. The TV's IP and the pairing
token it hands out are stored only in your phone's browser (`localStorage`) — nothing is sent to
this website or anywhere else.

## Limits

- In Wi-Fi mode **Power** can turn the TV **off**, not on (that needs Wake-on-LAN, which websites
  can't send). SmartThings mode can turn it on.
- Typing only works in Wi-Fi mode, while a text field / keyboard is open on the TV.
- App shortcuts use app ids from a 2021 Samsung TV. An id your TV doesn't have does nothing; add
  your own in Settings.

## Development

```bash
npm install
npm run dev      # http://localhost:3000
npm run build
```

Next.js (App Router) + TypeScript + Tailwind CSS. The remote is a client-only component
(`src/components/Remote.tsx`); Wi-Fi mode lives in `src/lib/tv.ts`, SmartThings mode in
`src/lib/st/` and `src/app/api/st/`, and the app shortcuts in `src/lib/apps.ts`. Deployed on Vercel.

### SmartThings setup (for your own deployment)

1. Create an OAuth-In app with the [SmartThings CLI](https://github.com/SmartThingsCommunity/smartthings-cli):
   `smartthings apps:create -i app.json`, where `app.json` has `"appType": "API_ONLY"`, scopes
   `r:devices:*` and `x:devices:*`, and the redirect URI `https://<your-domain>/api/st/callback`.
2. Set these environment variables on Vercel (never commit them):
   - `ST_CLIENT_ID`, `ST_CLIENT_SECRET` — from the CLI's output
   - `SESSION_SECRET` — a long random string (encrypts the session cookie)
   - `ST_REDIRECT_URI` — optional, if the callback URL differs from `<origin>/api/st/callback`
