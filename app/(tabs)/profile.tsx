import { Pressable, Switch, Text, View } from "react-native";
import { router } from "expo-router";
import { Page } from "../../components/Page";
import { Button, Eyebrow, Panel } from "../../components/ui";
import { useTheme } from "../../themes/ThemeProvider";
import { useAssistant } from "../../contexts/AssistantProvider";
import { LocationNotice } from "../../components/LocationNotice";
import { space, radius, type } from "../../design/tokens";
import { wakeRequirement } from "../../services/voice/types";
function Setting({
  title,
  detail,
  value,
  change,
}: {
  title: string;
  detail?: string;
  value: boolean;
  change(value: boolean): void;
}) {
  const {
    theme: { colors },
  } = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={title}
      accessibilityState={{ checked: value }}
      onPress={() => change(!value)}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space.md,
        minHeight: 52,
      }}
    >
      <View style={{ flex: 1, gap: space.xxs }}>
        <Text style={{ ...type.body, color: colors.text }}>{title}</Text>
        {detail && (
          <Text style={{ ...type.small, color: colors.muted }}>{detail}</Text>
        )}
      </View>
      <Switch
        accessible={false}
        pointerEvents="none"
        value={value}
        onValueChange={change}
        trackColor={{ false: colors.border, true: colors.accent }}
        thumbColor={value ? colors.onAccent : colors.muted}
      />
    </Pressable>
  );
}
export default function ProfileScreen() {
  const { theme, setTheme } = useTheme();
  const { colors } = theme;
  const assistant = useAssistant();
  const { settings, updateVoiceSettings } = assistant;
  return (
    <Page
      title="Make ROAM yours"
      subtitle="A calm companion. Set your preferences."
    >
      <View style={{ gap: space.sm }}>
        <Eyebrow>APPEARANCE</Eyebrow>
        <View
          accessibilityRole="radiogroup"
          style={{ flexDirection: "row", gap: space.xs }}
        >
          {(["dark", "light"] as const).map((id) => (
            <Pressable
              key={id}
              accessibilityRole="radio"
              accessibilityState={{ checked: theme.id === id }}
              onPress={() => setTheme(id)}
              style={{
                flex: 1,
                minHeight: 52,
                justifyContent: "center",
                alignItems: "center",
                backgroundColor:
                  theme.id === id ? colors.selected : colors.surface,
                borderWidth: 1,
                borderColor: theme.id === id ? colors.accent : colors.border,
                borderRadius: radius.md,
              }}
            >
              <Text
                style={{
                  ...type.body,
                  color: theme.id === id ? colors.accent : colors.text,
                }}
              >
                {id === "dark" ? "Dark" : "Light"}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={{ gap: space.sm }}>
        <Eyebrow>VOICE</Eyebrow>
        <Panel style={{ gap: space.md }}>
          <Setting
            title="Hey ROAM"
            detail="When enabled during an active trip, ROAM listens locally for the wake phrase."
            value={settings.heyRoam}
            change={(heyRoam) => updateVoiceSettings({ heyRoam })}
          />
          {wakeRequirement(assistant.wakeAvailability) && (
            <Text style={{ ...type.small, color: colors.muted }}>
              {wakeRequirement(assistant.wakeAvailability)}
            </Text>
          )}
          <Setting
            title="Automatic spoken replies"
            value={settings.autoSpeak}
            change={(autoSpeak) => updateVoiceSettings({ autoSpeak })}
          />
          <Setting
            title="Short replies while driving"
            value={settings.shortReplies}
            change={(shortReplies) => updateVoiceSettings({ shortReplies })}
          />
          <Setting
            title="Softer voice volume"
            detail="Uses 65% of your device’s current speech volume."
            value={settings.volume === "softer"}
            change={(value) =>
              updateVoiceSettings({ volume: value ? "softer" : "system" })
            }
          />
        </Panel>
      </View>
      <View style={{ gap: space.sm }}>
        <Eyebrow>UNITS</Eyebrow>
        <Text style={{ ...type.body, color: colors.text }}>
          Miles · GPS miles per hour
        </Text>
        <Text style={{ ...type.small, color: colors.muted }}>
          US units in this version. Phone GPS speed is an estimate.
        </Text>
      </View>
      <LocationNotice />
      <View style={{ gap: space.sm }}>
        <Eyebrow>PRIVACY</Eyebrow>
        <Text style={{ ...type.body, color: colors.muted }}>
          Hey ROAM processes wake audio on your device, only while the app is
          open during a trip. Command recognition begins after activation or a
          microphone tap; Apple’s speech service may process that audio
          remotely. ROAM does not save recordings.
        </Text>
        <Text style={{ ...type.small, color: colors.muted }}>
          Messages and a compact trip summary go to the configured ROAM backend
          and Gemini. Google receives location for places and routes. No
          location history or conversations are saved between sessions.
          Preferences are stored locally.
        </Text>
        <Text style={{ ...type.small, color: colors.muted }}>
          Wake detection pauses during spoken replies. Tap the microphone to
          stop playback. A short listening window opens after a verified
          confirmation question.
        </Text>
      </View>
      {__DEV__ && (
        <View style={{ gap: space.xs }}>
          <Eyebrow>DEVELOPMENT</Eyebrow>
          <Button secondary onPress={() => router.push("/diagnostics")}>
            Device diagnostics
          </Button>
          <Button secondary onPress={() => router.push("/design-review")}>
            Interface review states
          </Button>
        </View>
      )}
      <Text style={{ ...type.small, color: colors.muted }}>
        ROAM 0.5.0 · Your AI for the road.
      </Text>
    </Page>
  );
}
