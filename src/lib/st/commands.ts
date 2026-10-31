/**
 * How the remote's keys map onto SmartThings (shared by the client and the server's
 * allow-list). Samsung TVs expose most remote keys through `samsungvd.remoteControl`'s `send`
 * command; its keyValue list was read from the capability definition and checked against a
 * 2021 TV. Power on/off goes through `switch` (a plain POWER key would only toggle).
 */
export interface StCommand {
  capability: string;
  command: string;
  arguments?: (string | number)[];
}

const remote = (keyValue: string): StCommand => ({
  capability: "samsungvd.remoteControl",
  command: "send",
  arguments: [keyValue, "PRESS_AND_RELEASED"],
});

/** Remote key code (as used in Wi-Fi mode) → SmartThings command. */
export const ST_KEYS: Record<string, StCommand> = {
  KEY_UP: remote("UP"),
  KEY_DOWN: remote("DOWN"),
  KEY_LEFT: remote("LEFT"),
  KEY_RIGHT: remote("RIGHT"),
  KEY_ENTER: remote("OK"),
  KEY_RETURN: remote("BACK"),
  KEY_EXIT: remote("EXIT"),
  KEY_HOME: remote("HOME"),
  KEY_MENU: remote("MENU"),
  KEY_SOURCE: remote("SOURCE"),
  KEY_MUTE: remote("MUTE"),
  KEY_VOLUP: remote("VOLUP"),
  KEY_VOLDOWN: remote("VOLDOWN"),
  KEY_CHUP: remote("CHUP"),
  KEY_CHDOWN: remote("CHDOWN"),
  KEY_PLAY: remote("PLAY"),
  KEY_PAUSE: remote("PAUSE"),
  KEY_REWIND: remote("REWIND"),
  KEY_FF: remote("FF"),
  KEY_POWER: { capability: "switch", command: "off" },
  KEY_POWERON: { capability: "switch", command: "on" },
  ...Object.fromEntries(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"].map((n) => ["KEY_" + n, remote(n)])),
};

export const stLaunch = (appId: string, appName: string): StCommand => ({
  capability: "custom.launchapp",
  command: "launchApp",
  arguments: [appId, appName],
});

/** Everything the server is willing to forward to SmartThings. */
export const ST_ALLOWED: Record<string, string[]> = {
  "samsungvd.remoteControl": ["send"],
  switch: ["on", "off"],
  "custom.launchapp": ["launchApp"],
};
