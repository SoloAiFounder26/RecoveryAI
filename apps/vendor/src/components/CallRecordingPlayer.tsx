import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import * as Haptics from "expo-haptics";
import { Pressable, Text, View } from "react-native";
import { PauseIcon, PlayIcon } from "@/components/icons";
import { colors } from "@/theme/tokens";

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Inline player for an AI call recording (commitments.audio_url). Streams; nothing is downloaded. */
export function CallRecordingPlayer({ uri }: { uri: string }) {
  const player = useAudioPlayer({ uri });
  const status = useAudioPlayerStatus(player);
  const duration = status.duration || 0;
  const progress = duration > 0 ? Math.min(status.currentTime / duration, 1) : 0;

  const toggle = () => {
    Haptics.selectionAsync();
    if (status.playing) player.pause();
    else {
      if (status.didJustFinish || (duration > 0 && status.currentTime >= duration)) player.seekTo(0);
      player.play();
    }
  };

  return (
    <View className="mt-3 flex-row items-center rounded-2xl border border-line bg-obsidian px-3 py-2">
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={status.playing ? "Pause recording" : "Play recording"}
        className="h-9 w-9 items-center justify-center rounded-full bg-emerald"
      >
        {status.playing ? <PauseIcon color={colors.obsidian} size={14} /> : <PlayIcon color={colors.obsidian} size={14} />}
      </Pressable>
      <View className="mx-3 h-1 flex-1 overflow-hidden rounded-full bg-raised">
        <View style={{ width: `${progress * 100}%`, height: "100%", backgroundColor: colors.emerald }} />
      </View>
      <Text className="font-mono text-[11px] text-mute">
        {status.isLoaded ? `${fmt(status.currentTime)} / ${fmt(duration)}` : "loading"}
      </Text>
    </View>
  );
}
