import { useState } from "react";
import { ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { isValidIp } from "../lib/tv-local";
import { colors } from "../lib/theme";
import { Glass } from "./Glass";
import { Pill, T } from "./ui";

/** First run: SmartThings (anywhere, can turn the TV on) or Wi-Fi (fastest, can type). */
export function Setup({ initialIp, onWifi, onCloud }: { initialIp: string; onWifi: (ip: string) => void; onCloud: () => void }) {
  const insets = useSafeAreaInsets();
  const [ip, setIp] = useState(initialIp);
  const valid = isValidIp(ip);
  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 30, gap: 16 }} keyboardShouldPersistTaps="handled">
      <T style={{ fontSize: 34, fontWeight: "700", letterSpacing: -0.5 }}>TV Remote</T>
      <T style={{ color: colors.dim, lineHeight: 22 }}>Control your Samsung TV from this phone. Pick how to connect — you can switch any time.</T>

      <Glass style={{ padding: 18, gap: 10 }}>
        <T style={{ fontSize: 19, fontWeight: "700" }}>SmartThings</T>
        <T style={{ color: colors.dim, lineHeight: 21 }}>
          Sign in with your Samsung account. Works anywhere — even away from home — and can turn the TV on.
          The TV must be added in the SmartThings app.
        </T>
        <Pill label="Use SmartThings" icon="cloud-outline" primary onPress={onCloud} />
      </Glass>

      <Glass style={{ padding: 18, gap: 10 }}>
        <T style={{ fontSize: 19, fontWeight: "700" }}>Wi-Fi (direct)</T>
        <T style={{ color: colors.dim, lineHeight: 21 }}>
          Fastest, and can type into the TV. Phone and TV on the same Wi-Fi. Find the TV&apos;s IP on the TV:
          Settings → General → Network → Network Status → IP Settings.
        </T>
        <TextInput
          value={ip}
          onChangeText={(t) => setIp(t.trim())}
          placeholder="192.168.1.17"
          placeholderTextColor={colors.faint}
          keyboardType="decimal-pad"
          autoCorrect={false}
          style={{ color: colors.text, fontSize: 18, backgroundColor: colors.fill, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderColor: colors.hairline }}
        />
        <View style={{ opacity: valid ? 1 : 0.4 }} pointerEvents={valid ? "auto" : "none"}>
          <Pill label="Connect" icon="wifi" onPress={() => onWifi(ip)} />
        </View>
        <T style={{ color: colors.faint, fontSize: 13 }}>The TV will ask to allow “Phone Remote” — press Allow with your normal remote.</T>
      </Glass>
    </ScrollView>
  );
}
