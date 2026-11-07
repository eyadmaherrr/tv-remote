import { Ionicons } from "@expo/vector-icons";
import { useMemo, useRef, type ComponentProps, type ReactNode } from "react";
import {
  Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type TextProps, type TextStyle, type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../lib/theme";
import { Glass } from "./Glass";
import { Key, tap } from "./Key";

export function T({ style, ...rest }: TextProps & { style?: StyleProp<TextStyle> }) {
  return <Text {...rest} style={[{ color: colors.text, fontSize: 16 }, style]} />;
}

export type IconName = ComponentProps<typeof Ionicons>["name"];

export function Icon({ name, size = 24, color = colors.text }: { name: IconName; size?: number; color?: string }) {
  return <Ionicons name={name} size={size} color={color} />;
}

/** Round glass D-pad with OK in the middle; arrows repeat while held. */
export function DPad({ press }: { press: (code: string) => void }) {
  const arrow = (k: string, name: IconName, label: string, pos: ViewStyle) => (
    <Key k={k} press={press} repeat label={label} glass={false} style={[styles.arrow, pos]}>
      <Icon name={name} size={30} />
    </Key>
  );
  return (
    <Glass radius={130} style={styles.dpad}>
      {arrow("KEY_UP", "chevron-up", "Up", { top: 6, left: 80, width: 100, height: 78 })}
      {arrow("KEY_DOWN", "chevron-down", "Down", { bottom: 6, left: 80, width: 100, height: 78 })}
      {arrow("KEY_LEFT", "chevron-back", "Left", { left: 6, top: 80, width: 78, height: 100 })}
      {arrow("KEY_RIGHT", "chevron-forward", "Right", { right: 6, top: 80, width: 78, height: 100 })}
      <Key k="KEY_ENTER" press={press} label="OK" radius={50} style={styles.ok}>
        <T style={{ fontSize: 20, fontWeight: "700" }}>OK</T>
      </Key>
    </Glass>
  );
}

/** Swipe to move (keep dragging to keep moving); tap for OK. */
export function TouchPad({ press }: { press: (code: string) => void }) {
  const STEP = 44;
  const anchor = useRef({ x: 0, y: 0, moved: false });
  const responder = useMemo(
    // The handlers read `anchor` only while a finger moves, never during render.
    // eslint-disable-next-line react-hooks/refs
    () => PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        anchor.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, moved: false };
      },
      onPanResponderMove: (e) => {
        const a = anchor.current;
        const dx = e.nativeEvent.pageX - a.x;
        const dy = e.nativeEvent.pageY - a.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < STEP) return;
        tap();
        if (Math.abs(dx) > Math.abs(dy)) press(dx > 0 ? "KEY_RIGHT" : "KEY_LEFT");
        else press(dy > 0 ? "KEY_DOWN" : "KEY_UP");
        anchor.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, moved: true };
      },
      onPanResponderRelease: () => {
        if (!anchor.current.moved) {
          tap();
          press("KEY_ENTER");
        }
      },
    }),
    [press],
  );
  return (
    <Glass radius={28} style={styles.touch}>
      <View {...responder.panHandlers} style={styles.touchArea}>
        <T style={{ color: colors.faint, fontSize: 14 }}>Swipe to move · Tap for OK</T>
      </View>
    </Glass>
  );
}

/** Tall pill with an up key, a label, and a down key (volume, channel). */
export function Rocker({ label, up, down }: { label: string; up: ReactNode; down: ReactNode }) {
  return (
    <Glass radius={40} style={styles.rocker}>
      {up}
      <T style={{ textAlign: "center", fontSize: 12, fontWeight: "700", letterSpacing: 2, color: colors.dim }}>{label}</T>
      {down}
    </Glass>
  );
}

/** Two-option switch (Wi-Fi / SmartThings, D-pad / Touchpad, English / عربي). */
export function Segmented<V extends string>({
  value, options, onChange, small,
}: {
  value: V;
  options: { value: V; label: string; icon?: IconName }[];
  onChange: (v: V) => void;
  small?: boolean;
}) {
  return (
    <Glass radius={22} style={{ flexDirection: "row", padding: 4 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => {
              tap();
              onChange(o.value);
            }}
            style={[styles.segment, small ? { paddingHorizontal: 10, paddingVertical: 6 } : null, on ? { backgroundColor: "#fff" } : null]}
          >
            {o.icon ? <Icon name={o.icon} size={small ? 13 : 15} color={on ? "#000" : colors.dim} /> : null}
            <T style={{ fontSize: small ? 12 : 14, fontWeight: "600", color: on ? "#000" : colors.dim }}>{o.label}</T>
          </Pressable>
        );
      })}
    </Glass>
  );
}

/** Bottom sheet on glass. `onShow` runs once it has finished opening. */
export function Sheet({
  visible, title, onClose, onShow, children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  onShow?: () => void;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} onShow={onShow}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <Glass radius={28} style={[styles.sheet, { paddingBottom: insets.bottom + 18 }]}>
        <View style={styles.sheetHead}>
          <T style={{ fontSize: 19, fontWeight: "700" }}>{title}</T>
          <Pressable accessibilityLabel="Close" onPress={onClose} style={styles.close}>
            <Icon name="close" size={20} />
          </Pressable>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 560 }}>{children}</ScrollView>
      </Glass>
    </Modal>
  );
}

/** A plain glass pill button (not a remote key). */
export function Pill({ label, onPress, icon, primary, style }: { label: string; onPress: () => void; icon?: IconName; primary?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [styles.pill, primary ? { backgroundColor: "#fff" } : { backgroundColor: colors.fillStrong }, pressed ? { opacity: 0.7 } : null, style]}
    >
      {icon ? <Icon name={icon} size={16} color={primary ? "#000" : colors.text} /> : null}
      <T style={{ fontSize: 15, fontWeight: "600", color: primary ? "#000" : colors.text }}>{label}</T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  dpad: { width: 260, height: 260, alignSelf: "center" },
  arrow: { position: "absolute", borderRadius: 40, overflow: "hidden" },
  ok: { position: "absolute", left: 80, top: 80, width: 100, height: 100 },
  touch: { height: 260 },
  touchArea: { flex: 1, alignItems: "center", justifyContent: "center" },
  rocker: { flex: 1, paddingVertical: 4 },
  segment: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8 },
  backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 20, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.fillStrong },
  pill: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 11 },
});
