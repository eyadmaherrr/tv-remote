import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import type { TvApp } from "../../../src/lib/apps";
import { isValidIp } from "../lib/tv-local";
import { colors } from "../lib/theme";
import { Key, tap } from "./Key";
import { Icon, Pill, Sheet, T } from "./ui";

const input = {
  color: colors.text,
  fontSize: 17,
  backgroundColor: colors.fill,
  borderRadius: 16,
  paddingHorizontal: 14,
  paddingVertical: 11,
  borderWidth: 1,
  borderColor: colors.hairline,
} as const;

export function NumbersSheet({ visible, onClose, press }: { visible: boolean; onClose: () => void; press: (k: string) => void }) {
  const rows = [["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"]];
  const cell = { flex: 1, height: 62 } as const;
  return (
    <Sheet visible={visible} title="Numbers" onClose={onClose}>
      <View style={{ gap: 10 }}>
        {rows.map((r) => (
          <View key={r[0]} style={{ flexDirection: "row", gap: 10 }}>
            {r.map((n) => (
              <Key key={n} k={"KEY_" + n} press={press} label={n} style={cell}>
                <T style={{ fontSize: 24, fontWeight: "500" }}>{n}</T>
              </Key>
            ))}
          </View>
        ))}
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Key k="KEY_RETURN" press={press} label="Back" style={cell}><T>Back</T></Key>
          <Key k="KEY_0" press={press} label="0" style={cell}><T style={{ fontSize: 24, fontWeight: "500" }}>0</T></Key>
          <Key k="KEY_ENTER" press={press} label="OK" style={cell}><T>OK</T></Key>
        </View>
      </View>
    </Sheet>
  );
}

export function KeyboardSheet({
  visible, onClose, onSend, press,
}: {
  visible: boolean;
  onClose: () => void;
  onSend: (text: string) => void;
  press: (k: string) => void;
}) {
  const [text, setText] = useState("");
  return (
    <Sheet visible={visible} title="Type on the TV" onClose={onClose}>
      <View style={{ gap: 12 }}>
        <T style={{ color: colors.dim }}>First open a search box on the TV so its keyboard is showing, then type here.</T>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TextInput
            autoFocus
            value={text}
            onChangeText={setText}
            placeholder="Search…"
            placeholderTextColor={colors.faint}
            returnKeyType="send"
            onSubmitEditing={() => text && onSend(text)}
            style={[input, { flex: 1 }]}
          />
          <Pill label="Send" primary onPress={() => text && onSend(text)} />
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pill label="Enter" onPress={() => press("KEY_ENTER")} style={{ flex: 1 }} />
          <Pill label="Close keyboard" onPress={() => { setText(""); press("KEY_RETURN"); }} style={{ flex: 1 }} />
        </View>
      </View>
    </Sheet>
  );
}

export function SettingsSheet({
  visible, onClose, mode, ip, custom, tvs, tvId, onIp, onPairAgain, onSetup, onTv, onSignOut, onCustom,
}: {
  visible: boolean;
  onClose: () => void;
  mode: "wifi" | "cloud";
  ip: string;
  custom: TvApp[];
  tvs: { id: string; name: string }[];
  tvId: string;
  onIp: (ip: string) => void;
  onPairAgain: () => void;
  onSetup: () => void;
  onTv: (id: string) => void;
  onSignOut: () => void;
  onCustom: (list: TvApp[]) => void;
}) {
  const [nextIp, setNextIp] = useState(ip);
  const [name, setName] = useState("");
  const [id, setId] = useState("");
  return (
    <Sheet visible={visible} title="Settings" onClose={onClose}>
      <View style={{ gap: 22 }}>
        {mode === "wifi" ? (
          <View style={{ gap: 10 }}>
            <T style={{ color: colors.dim, fontSize: 14 }}>TV IP address</T>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TextInput value={nextIp} onChangeText={(t) => setNextIp(t.trim())} keyboardType="decimal-pad" style={[input, { flex: 1 }]} />
              <View style={{ opacity: isValidIp(nextIp) && nextIp !== ip ? 1 : 0.4 }} pointerEvents={isValidIp(nextIp) && nextIp !== ip ? "auto" : "none"}>
                <Pill label="Save" primary onPress={() => onIp(nextIp)} />
              </View>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <Pill label="Pair again" icon="refresh" onPress={onPairAgain} />
              <Pill label="Setup" icon="options-outline" onPress={onSetup} />
            </View>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            <T style={{ fontWeight: "700", fontSize: 17 }}>SmartThings TV</T>
            {tvs.length ? (
              tvs.map((t) => (
                <Pressable
                  key={t.id}
                  onPress={() => { tap(); onTv(t.id); }}
                  style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderRadius: 16, paddingHorizontal: 16, paddingVertical: 13, backgroundColor: t.id === tvId ? "#fff" : colors.fill }}
                >
                  <T style={{ color: t.id === tvId ? "#000" : colors.text }}>{t.name}</T>
                  {t.id === tvId ? <T style={{ color: "#000", fontSize: 12, fontWeight: "700" }}>IN USE</T> : null}
                </Pressable>
              ))
            ) : (
              <T style={{ color: colors.dim }}>No TVs found yet.</T>
            )}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <Pill label="Sign out of SmartThings" icon="log-out-outline" onPress={onSignOut} />
              <Pill label="Setup" icon="options-outline" onPress={onSetup} />
            </View>
          </View>
        )}

        <View style={{ gap: 10 }}>
          <T style={{ fontWeight: "700", fontSize: 17 }}>Your app shortcuts</T>
          <T style={{ color: colors.dim, fontSize: 14 }}>Add any app by its TV app id (for example 3201907018807 is Netflix).</T>
          {custom.map((a) => (
            <View key={a.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: colors.fill }}>
              <View>
                <T style={{ fontWeight: "600" }}>{a.name}</T>
                <T style={{ color: colors.faint, fontSize: 12 }}>{a.id}</T>
              </View>
              <Pressable accessibilityLabel={"Remove " + a.name} onPress={() => onCustom(custom.filter((x) => x.id !== a.id))} style={{ padding: 6 }}>
                <Icon name="close-circle" size={22} color={colors.dim} />
              </Pressable>
            </View>
          ))}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TextInput value={name} onChangeText={setName} placeholder="Name" placeholderTextColor={colors.faint} style={[input, { width: 110 }]} />
            <TextInput value={id} onChangeText={(t) => setId(t.trim())} placeholder="App id" placeholderTextColor={colors.faint} autoCapitalize="none" autoCorrect={false} style={[input, { flex: 1 }]} />
            <View style={{ opacity: name && id ? 1 : 0.4 }} pointerEvents={name && id ? "auto" : "none"}>
              <Pill label="Add" primary onPress={() => { onCustom([...custom, { id, name, custom: true }]); setName(""); setId(""); }} />
            </View>
          </View>
        </View>

        <T style={{ color: colors.faint, fontSize: 12, lineHeight: 18 }}>
          {mode === "wifi"
            ? "On Wi-Fi the power button turns the TV off but not on — switch to SmartThings to turn it on. "
            : "SmartThings mode can't type into the TV's keyboard, and each press takes a moment. "}
          The TV pairing and your SmartThings sign-in are kept in this phone&apos;s secure storage.
        </T>
      </View>
    </Sheet>
  );
}
