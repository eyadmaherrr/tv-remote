import { useEffect, useState } from "react";
import { AppState } from "react-native";

/** The TV's time-of-day look (same wallpapers and hours as Clean Home / Quran Play). */
export type Phase = "morning" | "day" | "evening" | "night";

export function phaseNow(date = new Date()): Phase {
  const h = date.getHours();
  if (h >= 5 && h < 10) return "morning";
  if (h >= 10 && h < 16) return "day";
  if (h >= 16 && h < 19) return "evening";
  return "night";
}

export const WALLPAPERS: Record<Phase, number> = {
  morning: require("../../assets/wallpapers/morning.jpg"),
  day: require("../../assets/wallpapers/day.jpg"),
  evening: require("../../assets/wallpapers/evening.jpg"),
  night: require("../../assets/wallpapers/night.jpg"),
};

/** Each wallpaper's own sky tone, lifted for contrast — the same accents the TV apps use. */
export const ACCENT: Record<Phase, string> = {
  morning: "#eece95",
  day: "#92bdf1",
  evening: "#f2c391",
  night: "#8dc8f5",
};

export const colors = {
  bg: "#0b0d12",
  text: "#f3f5f8",
  dim: "rgba(243, 245, 248, 0.62)",
  faint: "rgba(243, 245, 248, 0.38)",
  hairline: "rgba(255, 255, 255, 0.14)",
  fill: "rgba(255, 255, 255, 0.08)",
  fillStrong: "rgba(255, 255, 255, 0.16)",
  danger: "#f05252",
  ok: "#34d399",
  warn: "#fbbf24",
};

/** Follows the clock (checked every minute and whenever the app comes back to the front). */
export function usePhase(): Phase {
  const [phase, setPhase] = useState<Phase>(phaseNow);
  useEffect(() => {
    const t = setInterval(() => setPhase(phaseNow()), 60_000);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") setPhase(phaseNow());
    });
    return () => {
      clearInterval(t);
      sub.remove();
    };
  }, []);
  return phase;
}
