import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAssistant } from "../contexts/AssistantProvider";
import { useTheme } from "../themes/ThemeProvider";
import type { PlaceCategory } from "../types/domain";
import { Icon, IconButton } from "./ui";
import { placesService } from "../services/places";

const prompts = ["I’m hungry", "I need gas", "Find coffee", "Find a restroom"];
export function RoamAssistant({
  onPlaces,
}: {
  onPlaces: (category: PlaceCategory) => void;
}) {
  const {
    theme: { colors },
  } = useTheme();
  const { messages, state, send, toggleVoice, speak } = useAssistant();
  const [draft, setDraft] = useState("");
  const scroll = useRef<ScrollView>(null);
  const processing = state === "processing";
  const submit = () => {
    if (!draft.trim() || processing) return;
    void send(draft);
    setDraft("");
  };
  return (
    <View style={{ flex: 1, gap: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
        <View
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: colors.accent,
          }}
        />
        <Text
          accessibilityLiveRegion="polite"
          style={{
            color: colors.accent,
            fontSize: 10,
            letterSpacing: 1,
            fontWeight: "700",
          }}
        >
          {state === "idle"
            ? "YOUR AI FOR THE ROAD · DEMO"
            : state === "listening"
              ? "VOICE DEMO · CHOOSE A PROMPT"
              : state === "processing"
                ? "THINKING…"
                : "SPEAKING · TAP MIC TO STOP"}
        </Text>
      </View>
      <ScrollView
        ref={scroll}
        onContentSizeChange={() =>
          scroll.current?.scrollToEnd({ animated: true })
        }
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ gap: 16, paddingBottom: 10 }}
      >
        {messages.map((message) => (
          <View
            key={message.id}
            style={{
              alignSelf: message.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "94%",
              gap: 6,
            }}
          >
            <Text
              style={{
                color: colors.muted,
                fontSize: 9,
                letterSpacing: 1.4,
                paddingHorizontal: 3,
              }}
            >
              {message.role === "user" ? "YOU" : "ROAM"}
            </Text>
            <View
              style={[
                styles.bubble,
                {
                  backgroundColor:
                    message.role === "user"
                      ? colors.accentSoft
                      : colors.surface,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text
                style={{ color: colors.text, fontSize: 15, lineHeight: 23 }}
              >
                {message.text}
              </Text>
              {message.category && (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => onPlaces(message.category!)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 9,
                    minHeight: 44,
                    marginTop: 10,
                  }}
                >
                  <Icon
                    name="location-outline"
                    color={colors.accent}
                    size={18}
                  />
                  <Text
                    style={{
                      color: colors.accent,
                      fontSize: 13,
                      fontWeight: "700",
                    }}
                  >
                    {placesService.mode === "google"
                      ? "Search places"
                      : "Show demo places"}
                  </Text>
                  <Icon name="arrow-forward" color={colors.accent} size={16} />
                </Pressable>
              )}
            </View>
            {message.role === "assistant" && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Read ROAM response aloud"
                onPress={() => speak(message.text)}
                style={{
                  minHeight: 44,
                  minWidth: 44,
                  justifyContent: "center",
                  paddingHorizontal: 8,
                }}
              >
                <Icon
                  name="volume-medium-outline"
                  size={17}
                  color={colors.muted}
                />
              </Pressable>
            )}
          </View>
        ))}
        {processing && (
          <ActivityIndicator
            color={colors.accent}
            accessibilityLabel="ROAM is processing"
          />
        )}
      </ScrollView>
      {state === "listening" && (
        <View
          style={[styles.voiceDemo, { backgroundColor: colors.accentSoft }]}
        >
          <Icon name="mic-outline" color={colors.accent} />
          <View style={{ flex: 1, gap: 5 }}>
            <Text
              style={{ color: colors.text, fontWeight: "600", fontSize: 13 }}
            >
              Imagine saying “Hey ROAM…”
            </Text>
            <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 17 }}>
              Voice preview only. No audio is recorded. Choose a sample below or
              type your request.
            </Text>
          </View>
        </View>
      )}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ gap: 7 }}
      >
        {prompts.map((prompt) => (
          <Pressable
            key={prompt}
            accessibilityRole="button"
            disabled={processing}
            onPress={() => void send(prompt)}
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              paddingHorizontal: 13,
              minHeight: 44,
              justifyContent: "center",
              borderRadius: 14,
            }}
          >
            <Text style={{ color: colors.text, fontSize: 12 }}>{prompt}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingBottom: 4,
        }}
      >
        <IconButton
          icon={state === "speaking" ? "stop" : "mic-outline"}
          label={state === "speaking" ? "Stop speaking" : "Open voice demo"}
          active={state === "listening" || state === "speaking"}
          onPress={toggleVoice}
        />
        <View
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 16,
            backgroundColor: colors.surface,
            paddingLeft: 13,
            paddingRight: 4,
          }}
        >
          <TextInput
            accessibilityLabel="Message ROAM"
            value={draft}
            onChangeText={setDraft}
            placeholder="Ask me anything…"
            placeholderTextColor={colors.muted}
            maxLength={1000}
            returnKeyType="send"
            onSubmitEditing={submit}
            style={{ flex: 1, minHeight: 48, color: colors.text, fontSize: 14 }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send message"
            disabled={!draft.trim() || processing}
            onPress={submit}
            style={{
              width: 44,
              height: 44,
              alignItems: "center",
              justifyContent: "center",
              opacity: !draft.trim() || processing ? 0.35 : 1,
            }}
          >
            <Icon name="arrow-up-circle" size={30} color={colors.accent} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  bubble: { padding: 16, borderRadius: 19, borderWidth: 1 },
  voiceDemo: {
    padding: 14,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
});
