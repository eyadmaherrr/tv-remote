import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, AppState, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DEFAULT_APPS, type TvApp } from "../../../src/lib/apps";
import type { VoiceAction } from "../../../src/lib/voice/parse";
import { Glass } from "../components/Glass";
import { Key, RepeatRate, tap } from "../components/Key";
import { Setup } from "../components/Setup";
import { KeyboardSheet, NumbersSheet, SettingsSheet } from "../components/Sheets";
import { DPad, Icon, Pill, Rocker, Segmented, T, TouchPad } from "../components/ui";
import { VoiceSheet } from "../components/VoiceSheet";
import { prefs } from "../lib/storage";
import { ACCENT, WALLPAPERS, colors, usePhase } from "../lib/theme";
import { CloudTvConnection, type CloudStatus } from "../lib/tv-cloud";
import { LocalTv, type LocalStatus } from "../lib/tv-local";

type Mode = "wifi" | "cloud";
type SheetName = null | "numbers" | "keyboard" | "settings" | "voice";

/** Root: loads saved settings, then shows first-run setup or the remote. */
export default function Home() {
  const phase = usePhase();
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<Mode | null>(null);
  const [ip, setIp] = useState("");
  const [setup, setSetup] = useState(false);

  useEffect(() => {
    (async () => {
      const m = await prefs.get<Mode | null>("tv.mode", null);
      const i = await prefs.get<string>("tv.ip", "");
      setMode(m);
      setIp(i);
      setSetup(!m || (m === "wifi" && !i));
      setLoaded(true);
    })();
  }, []);

  const chooseMode = (m: Mode) => {
    prefs.set("tv.mode", m);
    setMode(m);
    if (m === "wifi" && !ip) setSetup(true);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Image source={WALLPAPERS[phase]} style={StyleSheet.absoluteFill} contentFit="cover" transition={600} />
      <LinearGradient colors={["rgba(8,10,16,0.35)", "rgba(8,10,16,0.55)", "rgba(8,10,16,0.88)"]} style={StyleSheet.absoluteFill} />
      {!loaded ? null : setup || !mode ? (
        <Setup
          initialIp={ip}
          onCloud={() => {
            chooseMode("cloud");
            setSetup(false);
          }}
          onWifi={(next) => {
            prefs.set("tv.ip", next);
            setIp(next);
            chooseMode("wifi");
            setSetup(false);
          }}
        />
      ) : (
        <Remote
          key={mode + ip}
          mode={mode}
          ip={ip}
          accent={ACCENT[phase]}
          onMode={chooseMode}
          onSetup={() => setSetup(true)}
          onIp={(next) => {
            prefs.set("tv.ip", next);
            setIp(next);
          }}
        />
      )}
    </View>
  );
}

function Remote({
  mode, ip, accent, onMode, onSetup, onIp,
}: {
  mode: Mode;
  ip: string;
  accent: string;
  onMode: (m: Mode) => void;
  onSetup: () => void;
  onIp: (ip: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const cloudMode = mode === "cloud";
  const local = useMemo(() => (cloudMode ? null : new LocalTv(ip)), [cloudMode, ip]);
  const cloud = useMemo(() => (cloudMode ? new CloudTvConnection() : null), [cloudMode]);
  const [localStatus, setLocalStatus] = useState<LocalStatus>("idle");
  const [cloudStatus, setCloudStatus] = useState<CloudStatus>("checking");
  const [tvs, setTvs] = useState<{ id: string; name: string }[]>([]);
  const [pad, setPad] = useState<"pad" | "touch">("pad");
  const [sheet, setSheet] = useState<SheetName>(null);
  const [custom, setCustom] = useState<TvApp[]>([]);
  const [toast, setToast] = useState("");
  const [toastOpacity] = useState(() => new Animated.Value(0));
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const say = useCallback(
    (text: string) => {
      setToast(text);
      Animated.timing(toastOpacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => Animated.timing(toastOpacity, { toValue: 0, duration: 250, useNativeDriver: true }).start(), 2000);
    },
    [toastOpacity],
  );

  useEffect(() => {
    prefs.get<TvApp[]>("tv.apps.custom", []).then(setCustom);
  }, []);

  // Wi-Fi: connect now and again whenever the app comes back to the front.
  useEffect(() => {
    if (!local) return;
    const off = local.onStatus(setLocalStatus);
    local.connect();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active" && local.getStatus() !== "connected") local.connect();
    });
    return () => {
      off();
      sub.remove();
      local.close();
    };
  }, [local]);

  // SmartThings: load the account's TVs; re-check when returning to the app (e.g. after sign-in).
  useEffect(() => {
    if (!cloud) return;
    const off = cloud.onStatus((s) => {
      setCloudStatus(s);
      setTvs(cloud.tvs.slice());
    });
    cloud.init();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active" && cloud.getStatus() !== "connected") cloud.init();
    });
    return () => {
      off();
      sub.remove();
    };
  }, [cloud]);

  const press = useCallback(
    (code: string) => {
      if (cloud) {
        if (!cloud.supports(code)) return say("Not available in SmartThings mode");
        if (cloud.getStatus() !== "connected") return say("Not connected to SmartThings");
        cloud.key(code).then((ok) => {
          if (!ok) say("The TV didn't respond");
        });
        return;
      }
      if (local && !local.key(code) && local.getStatus() !== "connected") say("Not connected to the TV");
    },
    [cloud, local, say],
  );

  const apps = useMemo(() => [...DEFAULT_APPS, ...custom], [custom]);

  const launch = useCallback(
    (app: TvApp) => {
      tap();
      say("Opening " + app.name);
      const done = (ok: boolean) => {
        if (!ok) say("Couldn't open " + app.name);
      };
      if (cloud) cloud.launch(app.id, app.name).then(done);
      else if (local) local.launch(app.id).then(done);
    },
    [cloud, local, say],
  );

  /** Spoken commands in order; repeats ("volume up 3") are spaced like real presses. */
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
        at += gap;
      }
    },
    [apps, cloudMode, launch, press, say],
  );

  const connected = cloudMode ? cloudStatus === "connected" : localStatus === "connected";
  const pending = cloudMode ? cloudStatus === "checking" : localStatus === "connecting" || localStatus === "waiting";
  const tvName = cloudMode ? tvs.find((t) => t.id === cloud?.deviceId)?.name || "SmartThings" : "Samsung TV";

  return (
    <RepeatRate.Provider value={cloudMode ? 450 : 130}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 10, paddingBottom: insets.bottom + 110, paddingHorizontal: 18, gap: 16 }}>
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 1 }}>
            <View style={[styles.dot, { backgroundColor: connected ? colors.ok : pending ? colors.warn : colors.danger }]} />
            <View style={{ flexShrink: 1 }}>
              <T numberOfLines={1} style={{ fontWeight: "700", fontSize: 17 }}>{tvName}</T>
              <T style={{ color: colors.dim, fontSize: 12 }}>{cloudMode ? "via SmartThings" : ip}</T>
            </View>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Segmented small value={mode} onChange={onMode} options={[{ value: "wifi", label: "Wi-Fi" }, { value: "cloud", label: "SmartThings" }]} />
            <Pressable accessibilityLabel="Settings" onPress={() => { tap(); setSheet("settings"); }}>
              <Glass radius={20} style={styles.round40}>
                <Icon name="settings-outline" size={20} />
              </Glass>
            </Pressable>
          </View>
        </View>

        <Banner
          mode={mode}
          localStatus={localStatus}
          cloudStatus={cloudStatus}
          onRetry={() => (cloud ? cloud.init() : local?.connect())}
          onSignIn={async () => {
            const err = await cloud?.signIn();
            if (err) say("Sign-in failed: " + err);
          }}
          onCloud={() => onMode("cloud")}
        />

        {/* Power / input / menu */}
        <View style={styles.row}>
          <Key k="KEY_POWER" press={press} label="Power off" style={styles.cell} tint="rgba(240,82,82,0.55)">
            <Icon name="power" size={22} />
            {cloudMode ? <T style={styles.keyText}>Off</T> : null}
          </Key>
          {cloudMode ? (
            <Key k="KEY_POWERON" press={press} label="Power on" style={styles.cell} tint="rgba(52,211,153,0.45)">
              <Icon name="power" size={22} />
              <T style={styles.keyText}>On</T>
            </Key>
          ) : null}
          <Key k="KEY_SOURCE" press={press} label="Input" style={styles.cell}>
            <Icon name="tv-outline" size={22} />
            {cloudMode ? null : <T style={styles.keyText}>Input</T>}
          </Key>
          <Key k="KEY_MENU" press={press} label="Settings menu" style={styles.cell}>
            <Icon name="menu" size={22} />
            {cloudMode ? null : <T style={styles.keyText}>Menu</T>}
          </Key>
        </View>

        {/* App shortcuts */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -18 }} contentContainerStyle={{ paddingHorizontal: 18, gap: 8 }}>
          {apps.map((app) => (
            <Pressable key={app.id} onPress={() => launch(app)}>
              <Glass radius={20} interactive style={styles.chip}>
                <T style={{ fontSize: 14, fontWeight: "600" }}>{app.name}</T>
              </Glass>
            </Pressable>
          ))}
        </ScrollView>

        <View style={{ alignItems: "center" }}>
          <Segmented
            value={pad}
            onChange={setPad}
            options={[
              { value: "pad", label: "D-pad", icon: "radio-button-on-outline" },
              { value: "touch", label: "Touchpad", icon: "hand-left-outline" },
            ]}
          />
        </View>

        {pad === "pad" ? <DPad press={press} /> : <TouchPad press={press} />}

        <View style={styles.row}>
          <Key k="KEY_RETURN" press={press} label="Back" style={styles.cell}>
            <Icon name="arrow-undo-outline" size={20} />
            <T style={styles.keyText}>Back</T>
          </Key>
          <Key k="KEY_HOME" press={press} label="Home" style={styles.cell}>
            <Icon name="home-outline" size={20} />
            <T style={styles.keyText}>Home</T>
          </Key>
          <Key k="KEY_EXIT" press={press} label="Exit" style={styles.cell}>
            <Icon name="close" size={20} />
            <T style={styles.keyText}>Exit</T>
          </Key>
        </View>

        {/* Volume, mute, numbers, channel */}
        <View style={[styles.row, { height: 168 }]}>
          <Rocker
            label="VOL"
            up={<Key k="KEY_VOLUP" press={press} repeat glass={false} label="Volume up" style={{ flex: 1 }}><Icon name="add" size={26} /></Key>}
            down={<Key k="KEY_VOLDOWN" press={press} repeat glass={false} label="Volume down" style={{ flex: 1 }}><Icon name="remove" size={26} /></Key>}
          />
          <View style={{ justifyContent: "space-between" }}>
            <Key k="KEY_MUTE" press={press} label="Mute" radius={30} style={styles.round60}>
              <Icon name="volume-mute-outline" size={22} />
            </Key>
            <Pressable accessibilityLabel="Number pad" onPress={() => { tap(); setSheet("numbers"); }}>
              <Glass radius={30} interactive style={styles.round60}>
                <T style={{ fontWeight: "700" }}>123</T>
              </Glass>
            </Pressable>
          </View>
          <Rocker
            label="CH"
            up={<Key k="KEY_CHUP" press={press} repeat glass={false} label="Channel up" style={{ flex: 1 }}><Icon name="chevron-up" size={26} /></Key>}
            down={<Key k="KEY_CHDOWN" press={press} repeat glass={false} label="Channel down" style={{ flex: 1 }}><Icon name="chevron-down" size={26} /></Key>}
          />
        </View>

        {/* Media + keyboard */}
        <View style={styles.row}>
          <Key k="KEY_REWIND" press={press} label="Rewind" style={styles.media} radius={24}><Icon name="play-back" size={20} /></Key>
          <Key k="KEY_PLAY" press={press} label="Play" style={styles.media} radius={24}><Icon name="play" size={20} /></Key>
          <Key k="KEY_PAUSE" press={press} label="Pause" style={styles.media} radius={24}><Icon name="pause" size={20} /></Key>
          <Key k="KEY_FF" press={press} label="Fast forward" style={styles.media} radius={24}><Icon name="play-forward" size={20} /></Key>
          {cloudMode ? null : (
            <Pressable accessibilityLabel="Keyboard" onPress={() => { tap(); setSheet("keyboard"); }} style={styles.media}>
              <Glass radius={24} interactive style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <Icon name="keypad-outline" size={20} />
              </Glass>
            </Pressable>
          )}
        </View>
      </ScrollView>

      {/* Voice */}
      <Pressable
        accessibilityLabel="Voice command"
        onPress={() => { tap(); setSheet("voice"); }}
        style={[styles.mic, { bottom: insets.bottom + 18, backgroundColor: accent }]}
      >
        <Icon name="mic" size={30} color="#0b0d12" />
      </Pressable>

      <Animated.View pointerEvents="none" style={[styles.toast, { bottom: insets.bottom + 96, opacity: toastOpacity }]}>
        <T style={{ color: "#000", fontWeight: "600", fontSize: 14 }}>{toast}</T>
      </Animated.View>

      <NumbersSheet visible={sheet === "numbers"} onClose={() => setSheet(null)} press={press} />
      <KeyboardSheet
        visible={sheet === "keyboard"}
        onClose={() => setSheet(null)}
        press={press}
        onSend={(t) => say(local && local.type(t) ? "Sent to TV" : "Not connected to the TV")}
      />
      <SettingsSheet
        visible={sheet === "settings"}
        onClose={() => setSheet(null)}
        mode={mode}
        ip={ip}
        custom={custom}
        tvs={tvs}
        tvId={cloud?.deviceId || ""}
        onIp={(next) => { setSheet(null); onIp(next); }}
        onPairAgain={async () => {
          if (!local) return;
          await local.forgetPairing();
          local.close();
          local.connect();
          setSheet(null);
          say("Press Allow on the TV if it asks");
        }}
        onSetup={() => { setSheet(null); onSetup(); }}
        onTv={async (id) => { await cloud?.chooseTv(id); setTvs(cloud ? cloud.tvs.slice() : []); setSheet(null); }}
        onSignOut={async () => { await cloud?.signOut(); setSheet(null); }}
        onCustom={(list) => { setCustom(list); prefs.set("tv.apps.custom", list); }}
      />
      <VoiceSheet visible={sheet === "voice"} onClose={() => setSheet(null)} apps={apps} run={runVoice} />
    </RepeatRate.Provider>
  );
}

function Banner({
  mode, localStatus, cloudStatus, onRetry, onSignIn, onCloud,
}: {
  mode: Mode;
  localStatus: LocalStatus;
  cloudStatus: CloudStatus;
  onRetry: () => void;
  onSignIn: () => void;
  onCloud: () => void;
}) {
  let text = "";
  const actions: { label: string; onPress: () => void; primary?: boolean }[] = [];
  if (mode === "cloud") {
    if (cloudStatus === "connected") return null;
    if (cloudStatus === "checking") text = "Checking SmartThings…";
    else if (cloudStatus === "not-configured") text = "SmartThings isn't set up on the server.";
    else if (cloudStatus === "signed-out") {
      text = "Sign in with your Samsung account to control your TV through SmartThings.";
      actions.push({ label: "Sign in with Samsung", onPress: onSignIn, primary: true });
    } else if (cloudStatus === "no-tv") {
      text = "No TV in your SmartThings account. In the SmartThings app tap + → Device → TV (with the TV on), then Retry.";
      actions.push({ label: "Retry", onPress: onRetry, primary: true });
    } else {
      text = "Couldn't reach SmartThings.";
      actions.push({ label: "Retry", onPress: onRetry, primary: true });
    }
  } else {
    if (localStatus === "connected") return null;
    if (localStatus === "connecting") text = "Connecting to the TV…";
    else if (localStatus === "waiting") text = "Waiting for the TV — if it asks, press Allow with your normal remote.";
    else if (localStatus === "denied") {
      text = "The TV refused the connection (Deny was pressed or the prompt timed out).";
      actions.push({ label: "Ask again", onPress: onRetry, primary: true });
    } else {
      text = localStatus === "unreachable"
        ? "Can't reach the TV. Check the phone is on the same Wi-Fi and the TV is on (and allow Local Network access if asked)."
        : "Disconnected.";
      actions.push({ label: "Retry", onPress: onRetry, primary: true }, { label: "Use SmartThings", onPress: onCloud });
    }
  }
  return (
    <Glass radius={20} tint="rgba(251,191,36,0.18)" style={{ padding: 14, gap: 10 }}>
      <T style={{ fontSize: 14, lineHeight: 20 }}>{text}</T>
      {actions.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {actions.map((a) => <Pill key={a.label} label={a.label} primary={a.primary} onPress={a.onPress} />)}
        </View>
      ) : null}
    </Glass>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  round40: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  round60: { width: 60, height: 60, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", gap: 10 },
  cell: { flex: 1, height: 54 },
  keyText: { fontSize: 14, fontWeight: "600" },
  chip: { paddingHorizontal: 16, paddingVertical: 10 },
  media: { flex: 1, height: 50 },
  mic: {
    position: "absolute", right: 20, width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.45, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 10,
  },
  toast: { position: "absolute", alignSelf: "center", backgroundColor: "#fff", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 9 },
});
