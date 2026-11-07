import * as Haptics from "expo-haptics";
import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { Glass } from "./Glass";

/** Hold-to-repeat interval: quick over Wi-Fi, gentler through SmartThings (a web request each). */
export const RepeatRate = createContext(130);

export function tap(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
}

/**
 * A remote key on glass. Fires on press-in (feels instant), with a light haptic; `repeat`
 * keeps sending while held, like a real remote's volume and arrow keys.
 */
export function Key({
  k,
  press,
  repeat,
  label,
  children,
  style,
  radius = 20,
  tint,
  glass = true,
}: {
  k: string;
  press: (code: string) => void;
  repeat?: boolean;
  label: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  radius?: number;
  tint?: string;
  /** false: a bare key inside an existing glass shape (D-pad arrows, rocker halves). */
  glass?: boolean;
}) {
  const rate = useContext(RepeatRate);
  const timers = useRef<{ t?: ReturnType<typeof setTimeout>; i?: ReturnType<typeof setInterval> }>({});
  const stop = () => {
    if (timers.current.t) clearTimeout(timers.current.t);
    if (timers.current.i) clearInterval(timers.current.i);
    timers.current = {};
  };
  useEffect(() => stop, []);

  const body = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPressIn={() => {
        tap();
        press(k);
        if (repeat) timers.current.t = setTimeout(() => (timers.current.i = setInterval(() => press(k), rate)), 400);
      }}
      onPressOut={stop}
      style={({ pressed }) => [
        { flex: 1, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
        pressed ? { backgroundColor: "rgba(255,255,255,0.14)" } : null,
      ]}
    >
      {children}
    </Pressable>
  );
  if (!glass) return <View style={style}>{body}</View>;
  return (
    <Glass style={style} radius={radius} interactive tint={tint}>
      {body}
    </Glass>
  );
}
