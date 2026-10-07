import { useEffect, useRef } from "react";
import { Animated, Text, View } from "react-native";
import { useTheme } from "../themes/ThemeProvider";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { motion, radius, space, type } from "../design/tokens";
import type { VoicePhase } from "../services/voice/types";

export const voiceLabels: Record<VoicePhase, string> = {
  inactive: "Ready when you are",
  armed: "Hey ROAM · listening locally",
  wakeDetected: "Heard you",
  listening: "Listening to your command",
  transcribing: "Finishing your words",
  thinking: "Thinking it through",
  usingTool: "Checking your journey",
  speaking: "Speaking · tap to stop",
  cooldown: "Returning to standby",
  error: "Voice needs a retry",
};
// Three staggered road strokes: a motion signature, not an audio waveform.
export function RoamPulse({
  phase = "inactive",
  size = 44,
  label = false,
  followUp = false,
}: {
  phase?: VoicePhase;
  size?: number;
  label?: boolean;
  followUp?: boolean;
}) {
  const {
    theme: { colors },
  } = useTheme();
  const reduced = useReducedMotion();
  const animation = useRef(new Animated.Value(0)).current;
  const moving = !["inactive", "armed", "error", "cooldown"].includes(phase);
  useEffect(() => {
    animation.stopAnimation();
    animation.setValue(0);
    if (reduced || !moving) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(animation, {
          toValue: 1,
          duration: motion.pulse / 2,
          useNativeDriver: true,
        }),
        Animated.timing(animation, {
          toValue: 0,
          duration: motion.pulse / 2,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [animation, reduced, moving]);
  const color =
    phase === "error"
      ? colors.danger
      : ["listening", "wakeDetected", "armed"].includes(phase)
        ? colors.listening
        : colors.accent;
  return (
    <View
      accessibilityLabel={
        followUp ? "Listening for your answer" : voiceLabels[phase]
      }
      style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}
    >
      <View
        accessible={!label}
        style={{
          width: size,
          height: size,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: color,
          backgroundColor: colors.accentSoft,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: size / 10,
        }}
      >
        {[0.32, 0.5, 0.4].map((height, index) => (
          <Animated.View
            key={index}
            style={{
              width: size / 12,
              height: size * height,
              borderRadius: radius.sm,
              backgroundColor: color,
              transform: [
                { skewX: "-16deg" },
                {
                  translateY: animation.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, ((index === 1 ? -1 : 1) * size) / 12],
                  }),
                },
              ],
              opacity: animation.interpolate({
                inputRange: [0, 1],
                outputRange: [0.7, 1],
              }),
            }}
          />
        ))}
      </View>
      {label && (
        <Text
          accessibilityLiveRegion="polite"
          style={{ ...type.small, color: colors.text, flexShrink: 1 }}
        >
          {followUp ? "Your answer · listening" : voiceLabels[phase]}
        </Text>
      )}
    </View>
  );
}
