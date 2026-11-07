import { router, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";
import { saveSessionFromUrl } from "../lib/tv-cloud";
import { colors } from "../lib/theme";

/**
 * tvremote://auth?session=… — SmartThings sign-in coming back. On iOS the sign-in sheet usually
 * catches this itself; on Android the link can open the app here instead, so save the session
 * and return to the remote (which re-checks SmartThings when it's shown again).
 */
export default function Auth() {
  const params = useLocalSearchParams<{ session?: string; error?: string }>();
  useEffect(() => {
    const q = new URLSearchParams();
    if (params.session) q.set("session", String(params.session));
    if (params.error) q.set("error", String(params.error));
    saveSessionFromUrl("tvremote://auth?" + q.toString()).finally(() => router.replace("/"));
  }, [params.session, params.error]);
  return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
}
