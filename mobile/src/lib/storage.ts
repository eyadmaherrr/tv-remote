import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

/** Preferences (TV IP, mode, app shortcuts, voice language) in AsyncStorage; secrets in the
 *  Keychain / Keystore via SecureStore (the TV pairing token and the SmartThings session). */
export const prefs = {
  async get<T>(key: string, fallback: T): Promise<T> {
    try {
      const raw = await AsyncStorage.getItem(key);
      return raw == null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  },
  async set<T>(key: string, value: T): Promise<void> {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  },
};

export const secrets = {
  async get(key: string): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  async set(key: string, value: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      /* ignore */
    }
  },
  async remove(key: string): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      /* ignore */
    }
  },
};

/** SecureStore keys may only contain letters, digits, ".", "-" and "_". */
export const tokenKey = (ip: string) => "tv_token_" + ip.replace(/[^0-9A-Za-z]/g, "_");
