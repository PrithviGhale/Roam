import { useRef, useState } from "react";
import {
  Linking,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAssistant } from "../contexts/AssistantProvider";
import { useRoam } from "../contexts/RoamProvider";
import { useTheme } from "../themes/ThemeProvider";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { space, radius, type } from "../design/tokens";
import { RoamPulse } from "./RoamPulse";
import { Button, IconButton } from "./ui";
import { PlaceList } from "./PlaceList";
import { GoogleAttribution } from "./GoogleAttribution";
import { StatusCard } from "./StatusCard";
import type { PlaceCategory } from "../types/domain";
export function RoamAssistant({
  onPlaces,
}: {
  onPlaces: (category: PlaceCategory) => void;
}) {
  const assistant = useAssistant();
  const { tripState } = useRoam();
  const {
    theme: { colors },
  } = useTheme();
  const reduced = useReducedMotion();
  const [draft, setDraft] = useState("");
  const scroll = useRef<ScrollView>(null);
  const processing = ["thinking", "usingTool", "transcribing"].includes(
    assistant.state,
  );
  const submit = () => {
    if (!draft.trim() || processing) return;
    void assistant.send(draft);
    setDraft("");
  };
  return (
    <View style={{ flex: 1, minHeight: 0, gap: space.sm }}>
      <View style={{ gap: space.xs }}>
        <RoamPulse
          phase={assistant.voicePhase}
          label
          followUp={assistant.voice.followUp}
        />
        {tripState.trip && (
          <Text
            numberOfLines={1}
            style={{ ...type.small, color: colors.muted }}
          >
            On the way to {tripState.trip.destination.name}
          </Text>
        )}
      </View>
      <ScrollView
        ref={scroll}
        style={{ flex: 1, minHeight: 0 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        onContentSizeChange={() =>
          scroll.current?.scrollToEnd({ animated: !reduced })
        }
        contentContainerStyle={{ gap: space.lg, paddingBottom: space.sm }}
      >
        {assistant.messages.map((message) => (
          <View
            key={message.id}
            style={{
              gap: space.xs,
              borderLeftWidth: message.role === "assistant" ? 2 : 0,
              borderLeftColor: message.error ? colors.danger : colors.accent,
              paddingLeft: message.role === "assistant" ? space.sm : 0,
              paddingVertical: space.xxs,
            }}
          >
            <Text style={{ ...type.label, color: colors.muted }}>
              {message.role === "user" ? "YOU" : "ROAM"}
            </Text>
            <Text
              selectable
              style={{
                ...type.body,
                color: message.role === "user" ? colors.muted : colors.text,
              }}
            >
              {message.error
                ? "ROAM couldn’t complete that request. Your trip is kept. Try again."
                : message.text}
            </Text>
            {message.category && (
              <Pressable
                accessibilityRole="button"
                onPress={() => onPlaces(message.category!)}
                style={{ minHeight: 44, justifyContent: "center" }}
              >
                <Text style={{ ...type.small, color: colors.accent }}>
                  Find {message.category} →
                </Text>
              </Pressable>
            )}
            {!!message.places?.length && (
              <>
                <PlaceList
                  places={message.places}
                  numbered
                  actionLabel="Add Stop"
                  disabled={
                    processing ||
                    tripState.status !== "ready" ||
                    !tripState.trip?.route
                  }
                  onSelect={(place) => void assistant.addPlace(place)}
                />
                <GoogleAttribution compact places={message.places} />
              </>
            )}
            {message.role === "assistant" && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Read ROAM response aloud"
                disabled={processing}
                onPress={() =>
                  assistant.speak(message.spokenText ?? message.text)
                }
                style={{
                  minHeight: 44,
                  justifyContent: "center",
                  alignSelf: "flex-start",
                }}
              >
                <Text style={{ ...type.small, color: colors.muted }}>
                  Read aloud
                </Text>
              </Pressable>
            )}
          </View>
        ))}
        {assistant.voiceNotice && (
          <StatusCard
            title="Voice"
            detail={assistant.voiceNotice}
            action={
              assistant.voiceNotice.includes("Settings")
                ? "Open Settings"
                : undefined
            }
            onPress={() => void Linking.openSettings().catch(() => {})}
          />
        )}
        {assistant.retryKind && (
          <Button
            secondary
            disabled={processing}
            onPress={() => void assistant.retryAssistant()}
          >
            {assistant.retryKind === "failed-action"
              ? "Retry failed action"
              : "Retry request"}
          </Button>
        )}
        {assistant.transcript && (
          <Text
            accessibilityLiveRegion="polite"
            style={{ ...type.body, color: colors.listening }}
          >
            {assistant.transcript}
          </Text>
        )}
      </ScrollView>
      {!tripState.trip?.startedAt && (
        <ScrollView
          horizontal
          style={{ flexGrow: 0 }}
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: space.xs }}
        >
          {["Find coffee", "I need gas", "What’s my ETA?"].map((prompt) => (
            <Pressable
              key={prompt}
              accessibilityRole="button"
              disabled={processing}
              onPress={() => void assistant.send(prompt)}
              style={{
                minHeight: 44,
                justifyContent: "center",
                paddingHorizontal: space.sm,
                backgroundColor: colors.elevated,
                borderRadius: radius.md,
              }}
            >
              <Text style={{ ...type.small, color: colors.text }}>
                {prompt}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
      <View
        style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}
      >
        <IconButton
          icon={
            assistant.state === "listening" ? "stop-outline" : "mic-outline"
          }
          active={assistant.state === "listening"}
          disabled={processing}
          label={
            assistant.state === "listening"
              ? "Stop voice conversation"
              : assistant.state === "speaking"
                ? "Interrupt speech and speak to ROAM"
                : "Speak to ROAM"
          }
          onPress={assistant.toggleVoice}
        />
        <View
          style={{
            flex: 1,
            minWidth: 0,
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radius.md,
            paddingLeft: space.sm,
            paddingRight: space.xxs,
          }}
        >
          <TextInput
            accessibilityLabel="Message ROAM"
            value={draft}
            onChangeText={setDraft}
            placeholder="Ask about your journey"
            placeholderTextColor={colors.muted}
            maxLength={1000}
            returnKeyType="send"
            onSubmitEditing={submit}
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: 52,
              ...type.body,
              color: colors.text,
            }}
          />
          <IconButton
            icon="arrow-up"
            active
            label="Send message"
            disabled={!draft.trim() || processing}
            onPress={submit}
          />
        </View>
      </View>
    </View>
  );
}
