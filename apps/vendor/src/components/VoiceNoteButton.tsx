import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from "expo-audio";
import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { expectSystemUi, systemUiDone } from "@/components/BiometricShield";
import type { VoiceActionResult } from "@/lib/webApi";
import { colors } from "@/theme/tokens";

// HIGH_QUALITY records AAC in an .m4a (MPEG-4) container on both platforms.
const MIME = "audio/mp4";
const MAX_SECONDS = 120;

/**
 * "AI Conversation": hold a quick Hinglish voice note after a call ("Sharma ji parso 50 hazar
 * denge"), and the web app's Gemini parser fills in the outcome, amount, date and notes.
 */
export function VoiceNoteButton({
  onTranscribe,
  onResult,
}: {
  onTranscribe: (uri: string, mimeType: string) => Promise<VoiceActionResult>;
  onResult: (result: VoiceActionResult) => void;
}) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [phase, setPhase] = useState<"idle" | "recording" | "processing">("idle");
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (phase !== "recording") return;
    setSeconds(0);
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    pulse.value = withRepeat(withTiming(1.25, { duration: 700 }), -1, true);
    return () => {
      clearInterval(t);
      cancelAnimation(pulse);
      pulse.value = 1;
    };
  }, [phase, pulse]);

  const start = async () => {
    if (phase !== "idle") return;
    setError(null);
    Haptics.selectionAsync();
    try {
      // The permission dialog is its own Android activity; don't let the vault relock behind it.
      expectSystemUi();
      const perm = await requestRecordingPermissionsAsync().finally(systemUiDone);
      if (!perm.granted) {
        setError("Allow microphone access in Settings to record a voice note.");
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record({ forDuration: MAX_SECONDS });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setPhase("recording");
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(`Couldn't start recording. ${e instanceof Error ? e.message : ""}`.trim());
    }
  };

  const stop = async () => {
    setPhase("processing");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false });
      if (!recorder.uri) throw new Error("Recording failed. Try again.");
      if (seconds < 1) throw new Error("That was too short. Hold on for a couple of seconds while you speak.");
      const result = await onTranscribe(recorder.uri, MIME);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onResult(result);
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPhase("idle");
    }
  };

  const ring = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }], opacity: 2 - pulse.value }));
  const recording = phase === "recording";

  return (
    <View>
      <Pressable
        onPress={recording ? stop : phase === "idle" ? start : undefined}
        accessibilityRole="button"
        accessibilityLabel={recording ? "Stop recording" : "Record a voice note"}
        className="flex-row items-center rounded-2xl border px-4 py-3 active:opacity-80"
        style={{ borderColor: recording ? colors.crimson : colors.line, backgroundColor: recording ? "rgba(255,51,102,0.08)" : colors.surface }}
      >
        <View className="mr-3 h-10 w-10 items-center justify-center">
          {recording && (
            <Animated.View style={[{ position: "absolute", width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,51,102,0.35)" }, ring]} />
          )}
          <View
            style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: recording ? colors.crimson : colors.gold }}
          >
            {phase === "processing" ? (
              <ActivityIndicator color={colors.obsidian} size="small" />
            ) : (
              recording ? <View style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: colors.obsidian }} /> : <MicIcon />
            )}
          </View>
        </View>
        <View className="flex-1">
          <Text className="text-[14px] font-bold text-ink">
            {recording ? `Recording… 0:${`${seconds}`.padStart(2, "0")}` : phase === "processing" ? "AI is listening…" : "Speak the outcome"}
          </Text>
          <Text className="mt-0.5 text-[12px] text-mute">
            {recording ? "Tap to stop" : phase === "processing" ? "Pulling out amount, date and outcome" : "Hindi, English or Hinglish. AI fills the form."}
          </Text>
        </View>
      </Pressable>
      {error ? <Text className="mt-2 text-[12px] text-crimson">{error}</Text> : null}
    </View>
  );
}

function MicIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Z" fill={colors.obsidian} />
      <Path d="M19 11a7 7 0 0 1-14 0M12 18v3" stroke={colors.obsidian} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}
