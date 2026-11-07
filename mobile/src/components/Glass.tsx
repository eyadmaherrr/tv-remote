import { BlurView } from "expo-blur";
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from "expo-glass-effect";
import type { ReactNode } from "react";
import { Platform, View, type StyleProp, type ViewStyle } from "react-native";
import { colors } from "../lib/theme";

/**
 * Real Liquid Glass on iOS 26+ (expo-glass-effect). Older iPhones get a dark blur, Android a
 * frosted translucent panel — same shape and spacing everywhere.
 */
export const LIQUID_GLASS =
  Platform.OS === "ios" && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();

export function Glass({
  children,
  style,
  radius = 24,
  interactive,
  tint,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  radius?: number;
  /** Liquid Glass reacts to touch (for buttons). */
  interactive?: boolean;
  tint?: string;
}) {
  const shape: ViewStyle = { borderRadius: radius, overflow: "hidden" };
  if (LIQUID_GLASS) {
    return (
      <GlassView style={[shape, style]} glassEffectStyle="regular" colorScheme="dark" isInteractive={interactive} tintColor={tint}>
        {children}
      </GlassView>
    );
  }
  const edge: ViewStyle = { borderWidth: 1, borderColor: colors.hairline };
  if (Platform.OS === "ios") {
    return (
      <BlurView intensity={38} tint="dark" style={[shape, edge, style]}>
        {tint ? <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: tint }} /> : null}
        {children}
      </BlurView>
    );
  }
  return <View style={[shape, edge, { backgroundColor: tint || "rgba(28, 33, 46, 0.62)" }, style]}>{children}</View>;
}
