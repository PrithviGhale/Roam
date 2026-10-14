import { useEffect, useRef, useState } from "react";
import { Animated, Text, View, AppState } from "react-native";
import { useTheme } from "../themes/ThemeProvider";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { radius, space, type } from "../design/tokens";
import type { VoicePhase } from "../services/voice/types";

export const voiceLabels: Record<VoicePhase, string> = {
  inactive: "Ready when you are",
  initializing: "Preparing Hey ROAM",
  preparing: "Opening microphone",
  armed: "Hey ROAM · listening locally",
  wakeDetected: "Heard you",
  listening: "Listening to your command",
  transcribing: "Finishing your words",
  thinking: "Thinking it through",
  usingTool: "Checking your journey",
  speaking: "Speaking · tap mic to reply",
  speechPending: "Preparing spoken reply",
  cooldown: "Returning to standby",
  error: "Voice needs a retry",
};
// Three staggered road strokes: a motion signature, not an audio waveform.
export function RoamPulse({
  phase = "inactive",
  size = 44,
  label = false,
  followUp = false,
  navigationAlert = false,
}: {
  phase?: VoicePhase;
  size?: number;
  label?: boolean;
  followUp?: boolean;
  navigationAlert?: boolean;
}) {
  const {
    theme: { colors },
  } = useTheme();
  const reduced = useReducedMotion();
  const lanes = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;
  const [foreground, setForeground] = useState(
    AppState.currentState === "active",
  );
  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) =>
      setForeground(state === "active"),
    );
    return () => listener.remove();
  }, []);
  const moving =
    navigationAlert || !["inactive", "error", "cooldown"].includes(phase);
  useEffect(() => {
    lanes.forEach((lane) => {
      lane.stopAnimation();
      lane.setValue(0);
    });
    if (reduced || !moving || !foreground) return;
    const duration =
      phase === "armed"
        ? 2200
        : phase === "listening"
          ? 850
          : phase === "speaking"
            ? 1200
            : 1550;
    const animations = lanes.map((lane, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 100),
          Animated.timing(lane, {
            toValue: 1,
            duration: duration / 2,
            useNativeDriver: true,
          }),
          Animated.timing(lane, {
            toValue: 0,
            duration: duration / 2,
            useNativeDriver: true,
          }),
        ]),
      ),
    );
    animations.forEach((animation) => animation.start());
    return () => animations.forEach((animation) => animation.stop());
  }, [lanes, reduced, moving, foreground, phase]);
  const color =
    phase === "error"
      ? colors.danger
      : ["listening", "wakeDetected", "armed"].includes(phase)
        ? colors.listening
        : colors.accent;
  return (
    <View
      accessibilityLabel={
        navigationAlert
          ? "Navigation update"
          : followUp
            ? "Listening for your answer"
            : voiceLabels[phase]
      }
      style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}
    >
      <View
        accessible={!label}
        style={{
          width: size,
          height: size,

          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: size / 10,
        }}
      >
        {[0, 1, 2].map((index) => (
          <Animated.View
            key={index}
            style={{
              width: size / 9,
              height: size * (index === 1 ? 0.62 : 0.48),
              borderRadius: radius.sm,
              backgroundColor: color,
              transform: [
                { skewX: "-16deg" },
                {
                  translateY: lanes[index]!.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, ((index === 1 ? -1 : 1) * size) / 12],
                  }),
                },
              ],
              opacity: lanes[index]!.interpolate({
                inputRange: [0, 1],
                outputRange: [phase === "armed" ? 0.5 : 0.72, 1],
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
