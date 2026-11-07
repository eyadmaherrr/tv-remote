/**
 * Turns a spoken sentence (English or Arabic, as the browser's speech recognition wrote it)
 * into remote actions. Rule-based on purpose: a fixed set of TV commands, instant, offline,
 * no API key. Several commands can be chained with "and" / "then" / "و" / "وبعدين".
 *
 * Self-contained (no imports) so it can be tested directly with Node.
 */

export type VoiceAction =
  | { type: "key"; code: string; times: number; label: string }
  | { type: "launch"; appId: string; name: string }
  | { type: "power"; on: boolean };

export interface VoiceApp {
  id: string;
  name: string;
}

/** Extra ways people say an app's name, keyed by app id. Arabic spellings included. */
const APP_ALIASES: Record<string, string[]> = {
  // "home" is Clean Home (the user's home screen); Samsung's own is "smart hub".
  "tvunlock02.Launcher": ["clean home", "home", "go home", "home screen", "my home", "launcher", "الشاشه الرئيسيه", "الرئيسيه", "هوم", "كلين هوم"],
  "QuranPlay1.QuranPlay": ["quran play", "quran", "koran", "the quran", "قران", "القران", "قران بلاي", "المصحف"],
  "111299001912": ["youtube", "you tube", "يوتيوب", "اليوتيوب"],
  "3201907018807": ["netflix", "net flix", "نتفلكس", "نتفليكس"],
  "Ggl33q588H.MBC": ["shahid", "shahed", "mbc", "شاهد"],
  "J5PGJgxrjt.WatchIT": ["watch it", "watchit", "واتش ات", "واتش ات"],
  "yvoS9TN5KY.YangoSpark": ["yango", "yango play", "يانجو", "يانغو"],
  "BlDC3WXVuw.sample": ["osn", "osn plus", "osn+", "او اس ان"],
};

const NUMBER_WORDS: Record<string, number> = {
  one: 1, once: 1, two: 2, twice: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  واحد: 1, واحده: 1, مره: 1, اتنين: 2, اثنين: 2, مرتين: 2, تلاته: 3, ثلاثه: 3, اربعه: 4, خمسه: 5, سته: 6,
  سبعه: 7, تمانيه: 8, ثمانيه: 8, تسعه: 9, عشره: 10,
};

/** Lower-case, no punctuation or tashkeel, one spelling for alef / ta marbuta / alef maqsura. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[.,!?؟،;:"'()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const has = (s: string, words: string[]) => words.some((w) => new RegExp("(^| )" + w + "( |$)").test(s));

/** "volume up 3", "go down three times", "ارفع الصوت ٣ مرات" → 3 (capped at 20). */
function countIn(s: string): number {
  const digit = s.match(/(^| )(\d{1,2})( |$)/);
  if (digit) return Math.min(20, Math.max(1, parseInt(digit[2], 10)));
  for (const w of s.split(" ")) if (NUMBER_WORDS[w]) return NUMBER_WORDS[w];
  return 1;
}

function key(code: string, label: string, times = 1): VoiceAction {
  return { type: "key", code, times, label };
}

function findApp(s: string, apps: VoiceApp[]): VoiceApp | null {
  let best: { app: VoiceApp; len: number } | null = null;
  for (const app of apps) {
    const names = [normalize(app.name), ...(APP_ALIASES[app.id] || []).map(normalize)];
    for (const n of names) {
      if (n && (" " + s + " ").includes(" " + n + " ") && (!best || n.length > best.len)) best = { app, len: n.length };
    }
  }
  return best ? best.app : null;
}

const CLOSE = ["close", "exit", "quit", "اقفل", "قفل", "اخرج من", "سيب"];
const OPEN = ["open", "launch", "start", "go to", "show", "play", "put on", "switch to", "افتح", "فتح", "شغل", "شغلي", "روح", "ادخل", "دخلني"];

/** One command (no "and"). */
function parseOne(s: string, apps: VoiceApp[]): VoiceAction | null {
  const n = countIn(s);
  const app = findApp(s, apps);

  // "close YouTube" → leave the app. (Checked before opening, and before "close the TV".)
  if (app && has(s, CLOSE) && !has(s, ["tv", "television", "تلفزيون", "التلفزيون", "التليفزيون"])) return key("KEY_EXIT", "Close " + app.name);

  // "open YouTube", "open YouTube on the TV", "افتح يوتيوب", or just the app's name.
  if (app && (has(s, OPEN) || s.split(" ").length <= 3)) return { type: "launch", appId: app.id, name: app.name };

  // Power. "close the tv" / "turn off" / "اقفل التلفزيون"; "open the tv" / "turn on".
  const tv = has(s, ["tv", "television", "the tv", "تلفزيون", "التلفزيون", "التليفزيون", "تليفزيون", "الشاشه", "التي في"]);
  if ((has(s, ["turn off", "switch off", "shut down", "shutdown", "power off", "close", "اقفل", "قفل", "طفي", "اطفي"]) && tv) ||
      has(s, ["turn off the tv", "power off", "اطفي التلفزيون"])) return { type: "power", on: false };
  if ((has(s, ["turn on", "switch on", "power on", "open", "wake", "شغل", "افتح", "ولع"]) && tv) || has(s, ["power on", "wake up"])) {
    return { type: "power", on: true };
  }

  // Volume.
  if (has(s, ["unmute", "sound on", "شغل الصوت", "رجع الصوت"])) return key("KEY_MUTE", "Unmute");
  if (has(s, ["mute", "silence", "quiet", "اكتم", "كتم", "اسكت", "وقف الصوت"])) return key("KEY_MUTE", "Mute");
  const vol = has(s, ["volume", "sound", "louder", "quieter", "صوت", "الصوت"]);
  if (has(s, ["louder", "volume up", "turn up", "increase", "raise", "ارفع", "علي", "زود"]) && (vol || has(s, ["louder", "turn up"]))) {
    return key("KEY_VOLUP", "Volume up", n);
  }
  if (has(s, ["quieter", "softer", "volume down", "turn down", "lower", "decrease", "وطي", "قلل", "نزل"]) &&
      (vol || has(s, ["quieter", "softer", "turn down"]))) return key("KEY_VOLDOWN", "Volume down", n);

  // Channels.
  const ch = has(s, ["channel", "قناه", "القناه"]);
  if (ch && has(s, ["next", "up", "الجايه", "اللي بعدها"])) return key("KEY_CHUP", "Channel up", n);
  if (ch && has(s, ["previous", "down", "اللي قبلها", "السابقه"])) return key("KEY_CHDOWN", "Channel down", n);

  // Navigation.
  if (has(s, ["go back", "back", "return", "ارجع", "رجوع", "رجعني"])) return key("KEY_RETURN", "Back", n);
  if (has(s, ["exit", "اخرج", "خروج"])) return key("KEY_EXIT", "Exit");
  if (has(s, ["smart hub", "samsung home"])) return key("KEY_HOME", "Smart Hub");
  if (has(s, ["menu", "settings", "options", "القائمه", "الاعدادات", "منيو"])) return key("KEY_MENU", "Menu");
  if (has(s, ["input", "source", "hdmi", "المصدر", "مصدر"])) return key("KEY_SOURCE", "Input");
  if (has(s, ["ok", "okay", "select", "enter", "choose", "click", "اختار", "اوكي", "اختر", "دوس"])) return key("KEY_ENTER", "OK");
  if (has(s, ["up", "فوق", "لفوق", "اطلع"])) return key("KEY_UP", "Up", n);
  if (has(s, ["down", "تحت", "لتحت", "انزل"])) return key("KEY_DOWN", "Down", n);
  if (has(s, ["left", "شمال", "يسار"])) return key("KEY_LEFT", "Left", n);
  if (has(s, ["right", "يمين"])) return key("KEY_RIGHT", "Right", n);

  // Playback.
  if (has(s, ["pause", "stop", "وقف", "استنى", "ايقاف"])) return key("KEY_PAUSE", "Pause");
  if (has(s, ["resume", "play", "continue", "كمل", "شغل"])) return key("KEY_PLAY", "Play");
  if (has(s, ["rewind", "backward", "رجع ورا"])) return key("KEY_REWIND", "Rewind", n);
  if (has(s, ["fast forward", "forward", "skip", "قدم"])) return key("KEY_FF", "Fast forward", n);

  return null;
}

/** All commands in a sentence, in order. Empty when nothing was understood. */
export function parseVoice(text: string, apps: VoiceApp[]): VoiceAction[] {
  const s = normalize(text);
  if (!s) return [];
  const whole = parseOne(s, apps);
  const parts = s.split(/ (?:and then|and|then|after that|وبعدين|وبعد كده|ثم) | و(?=\S)/).filter(Boolean);
  if (parts.length > 1) {
    const each = parts.map((p) => parseOne(p.trim(), apps));
    if (each.every(Boolean)) return each as VoiceAction[];
  }
  return whole ? [whole] : [];
}
