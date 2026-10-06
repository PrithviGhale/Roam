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
import { PlaceList } from "./PlaceList";
import { GoogleAttribution } from "./GoogleAttribution";
import { useRoam } from "../contexts/RoamProvider";

const prompts = ["I’m hungry", "I need gas", "I need to pee", "What’s my ETA?"];
export function RoamAssistant({
  onPlaces,
}: {
  onPlaces: (category: PlaceCategory) => void;
}) {
  const {
    theme: { colors },
  } = useTheme();
  const {
    messages,
    state,
    mode,
    send,
    addPlace,
    toggleVoice,
    speak,
    autoSpeak,
    setAutoSpeak,
    voiceNotice,
    transcript,
  } = useAssistant();
  const { tripState } = useRoam();
  const [draft, setDraft] = useState("");
  const scroll = useRef<ScrollView>(null);
  const processing =
    state === "thinking" || state === "usingTool" || state === "transcribing";
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
            flexShrink: 1,
            lineHeight: 15,
          }}
        >
          {state === "idle"
            ? mode === "gemini"
              ? "YOUR AI FOR THE ROAD · GEMINI"
              : "YOUR AI FOR THE ROAD · DEMO"
            : state === "listening"
              ? "LISTENING · TAP MIC TO FINISH"
              : state === "usingTool"
                ? "CHECKING PLACES AND YOUR TRIP…"
                : state === "thinking"
                  ? "THINKING…"
                  : state === "transcribing"
                    ? "FINISHING YOUR REQUEST…"
                    : state === "error"
                      ? "TRY AGAIN WHEN YOU’RE READY"
                      : "SPEAKING · TAP MIC TO STOP"}
        </Text>
        <View style={{ flex: 1 }} />
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: autoSpeak }}
          accessibilityLabel="Automatic concise voice replies"
          onPress={() => setAutoSpeak(!autoSpeak)}
          style={{ minHeight: 44, justifyContent: "center" }}
        >
          <Text style={{ color: colors.muted, fontSize: 10 }}>
            Voice replies {autoSpeak ? "on" : "off"}
          </Text>
        </Pressable>
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
              ...(message.places?.length ? { width: "100%" as const } : {}),
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
                style={{
                  color: message.error ? colors.danger : colors.text,
                  fontSize: 15,
                  lineHeight: 23,
                }}
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
            {message.places && message.places.length > 0 && (
              <View style={{ gap: 8, width: "100%" }}>
                <PlaceList
                  places={message.places}
                  numbered
                  actionLabel="Add Stop"
                  disabled={
                    processing ||
                    tripState.status !== "ready" ||
                    !tripState.trip?.route
                  }
                  onSelect={(place) => void addPlace(place)}
                />
                <GoogleAttribution places={message.places} />
                <Text style={{ color: colors.muted, fontSize: 10 }}>
                  Use a card, or type “add the second one.”{" "}
                  {tripState.trip?.route
                    ? ""
                    : "Choose a destination on the map before adding stops."}
                </Text>
              </View>
            )}
            {message.role === "assistant" && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Read ROAM response aloud"
                onPress={() => speak(message.spokenText ?? message.text)}
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
          <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
            <ActivityIndicator color={colors.accent} />
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              {state === "usingTool"
                ? "Finding options or updating your trip…"
                : "Checking your request…"}
            </Text>
          </View>
        )}
      </ScrollView>
      {(state === "listening" || voiceNotice) && (
        <View
          style={[styles.voiceDemo, { backgroundColor: colors.accentSoft }]}
        >
          <Icon name="mic-outline" color={colors.accent} />
          <View style={{ flex: 1, gap: 5 }}>
            <Text
              style={{ color: colors.text, fontWeight: "600", fontSize: 13 }}
            >
              {voiceNotice
                ? "Text input is always available"
                : "Listening to your request"}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 17 }}>
              {voiceNotice ??
                (transcript ||
                  "Speak now. Tap the microphone to finish. No wake word or background listening.")}
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
          icon={
            state === "speaking" || state === "listening"
              ? "stop"
              : "mic-outline"
          }
          label={
            state === "speaking"
              ? "Stop speaking"
              : state === "listening"
                ? "Finish speaking"
                : "Speak to ROAM"
          }
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
