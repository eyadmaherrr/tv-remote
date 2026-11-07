import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { parseVoice, type VoiceAction, type VoiceApp } from "../../../src/lib/voice/parse";
import { prefs } from "../lib/storage";
import { colors } from "../lib/theme";
import { tap } from "./Key";
import { Icon, Segmented, Sheet, T } from "./ui";

type Lang = "en-US" | "ar-EG";
const LANG_KEY = "tv.voice.lang";

const EXAMPLES: Record<Lang, string[]> = {
  "en-US": ["Open YouTube", "Turn off the TV", "Go back", "Volume up 3", "Open Netflix and turn the volume down", "Go home"],
  "ar-EG": ["افتح يوتيوب", "اقفل التلفزيون", "ارجع", "ارفع الصوت ٣ مرات", "افتح القرآن", "وطي الصوت"],
};

function describe(a: VoiceAction): string {
  if (a.type === "launch") return "Opening " + a.name;
  if (a.type === "power") return a.on ? "Turning the TV on" : "Turning the TV off";
  return a.label + (a.times > 1 ? " ×" + a.times : "");
}

/**
 * Voice commands with the phone's own speech recognition (Apple's on iPhone, Google's on
 * Android), turned into actions by the same parser the website uses.
 */
export function VoiceSheet({
  visible, onClose, apps, run,
}: {
  visible: boolean;
  onClose: () => void;
  apps: VoiceApp[];
  run: (actions: VoiceAction[]) => void;
}) {
  const [lang, setLang] = useState<Lang>("en-US");
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const [result, setResult] = useState("");
  const handled = useRef(false);
  const ar = lang === "ar-EG";

  useEffect(() => {
    prefs.get<Lang>(LANG_KEY, "en-US").then(setLang);
  }, []);

  const listen = async (language: Lang = lang) => {
    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perm.granted) {
      setResult("Microphone or speech permission is off — allow it in Settings.");
      return;
    }
    handled.current = false;
    setHeard("");
    setResult("");
    ExpoSpeechRecognitionModule.start({ lang: language, interimResults: true, maxAlternatives: 3, continuous: false });
  };


  useSpeechRecognitionEvent("start", () => setListening(true));
  useSpeechRecognitionEvent("end", () => setListening(false));
  useSpeechRecognitionEvent("result", (event) => {
    const first = event.results[0]?.transcript || "";
    setHeard(first);
    if (!event.isFinal || handled.current) return;
    handled.current = true;
    // Try each alternative the recogniser offers until one is a command.
    for (const alt of event.results) {
      const actions = parseVoice(alt.transcript, apps);
      if (actions.length) {
        setHeard(alt.transcript);
        setResult(actions.map(describe).join(" · "));
        run(actions);
        setTimeout(onClose, 1300);
        return;
      }
    }
    setResult(ar ? "مفهمتش الأمر — جرب تاني" : "That's not a command I know — try again");
  });
  useSpeechRecognitionEvent("error", (event) => {
    setListening(false);
    if (event.error === "aborted") return;
    if (event.error === "not-allowed" || event.error === "service-not-allowed") setResult("Microphone or speech permission is off — allow it in Settings.");
    else if (event.error === "no-speech" || event.error === "speech-timeout") setResult(ar ? "مسمعتش حاجة" : "Didn't hear anything");
    else if (event.error === "language-not-supported") setResult("This language isn't available for speech on this phone.");
    else setResult("Voice error: " + event.error);
  });

  const switchLang = (next: Lang) => {
    setLang(next);
    prefs.set(LANG_KEY, next);
    ExpoSpeechRecognitionModule.abort();
    setTimeout(() => listen(next), 250);
  };

  return (
    <Sheet
      visible={visible}
      title="Voice"
      onShow={() => listen()}
      onClose={() => {
        ExpoSpeechRecognitionModule.abort();
        onClose();
      }}
    >
      <View style={{ alignItems: "center", gap: 16, paddingBottom: 8 }}>
        <Segmented
          value={lang}
          onChange={switchLang}
          options={[
            { value: "en-US", label: "English" },
            { value: "ar-EG", label: "عربي" },
          ]}
        />
        <Pressable
          accessibilityLabel={listening ? "Stop listening" : "Listen again"}
          onPress={() => {
            tap();
            if (listening) ExpoSpeechRecognitionModule.stop();
            else listen();
          }}
          style={{
            width: 96, height: 96, borderRadius: 48, alignItems: "center", justifyContent: "center",
            backgroundColor: listening ? colors.danger : "#fff",
          }}
        >
          <Icon name="mic" size={42} color={listening ? "#fff" : "#000"} />
        </Pressable>
        <T style={{ fontSize: 20, fontWeight: "600", textAlign: "center", minHeight: 28 }}>
          {heard || (listening ? (ar ? "بسمعك…" : "Listening…") : "")}
        </T>
        <T style={{ color: colors.dim, textAlign: "center", minHeight: 22 }}>
          {result || (!listening && !heard ? (ar ? "دوس على المايك واتكلم" : "Tap the mic and speak") : "")}
        </T>
        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
          {EXAMPLES[lang].map((ex) => (
            <View key={ex} style={{ backgroundColor: colors.fill, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 }}>
              <T style={{ fontSize: 13, color: colors.dim }}>“{ex}”</T>
            </View>
          ))}
        </View>
      </View>
    </Sheet>
  );
}
