import { Redirect, router } from "expo-router";
import { Text, View, useWindowDimensions } from "react-native";
import { Page } from "../components/Page";
import { Button, Eyebrow } from "../components/ui";
import { RoamPulse } from "../components/RoamPulse";
import { StatusCard } from "../components/StatusCard";
import { PlaceList, SuggestionsList } from "../components/PlaceList";
import { useTheme } from "../themes/ThemeProvider";
import type { VoicePhase } from "../services/voice/types";
import type { Place } from "../types/domain";
import { space, type } from "../design/tokens";
const phases: VoicePhase[] = [
  "inactive",
  "armed",
  "wakeDetected",
  "listening",
  "transcribing",
  "thinking",
  "usingTool",
  "speaking",
  "cooldown",
  "error",
];
const sample: Place = {
  id: "review-only",
  name: "Sample café · review fixture",
  subtitle: "Not a real recommendation",
  source: "mock",
  category: "coffee",
  coordinate: { latitude: 0, longitude: 0 },
};
export default function DesignReview() {
  if (!__DEV__) return <Redirect href="/profile" />;
  return <Review />;
}
function Review() {
  const { theme, setTheme } = useTheme();
  const { colors } = theme;
  const { width, height, fontScale } = useWindowDimensions();
  return (
    <Page
      title="Interface review"
      subtitle="Development fixtures · no navigation actions or live data"
    >
      <Button secondary onPress={() => router.back()}>
        Back
      </Button>
      <Button
        secondary
        onPress={() => setTheme(theme.id === "dark" ? "light" : "dark")}
      >
        Switch to {theme.id === "dark" ? "light" : "dark"}
      </Button>
      <Text style={{ ...type.body, color: colors.text }}>
        {width} × {height} points · text scale {fontScale.toFixed(2)}
      </Text>
      <Eyebrow>VOICE STATES</Eyebrow>
      {phases.map((phase) => (
        <View key={phase} style={{ gap: space.xs }}>
          <Text style={{ ...type.small, color: colors.muted }}>{phase}</Text>
          <RoamPulse phase={phase} label />
        </View>
      ))}
      <RoamPulse phase="listening" followUp label />
      <Eyebrow>WAITING / PERMISSION / FAILURE</Eyebrow>
      {[
        "Finding your position",
        "Looking for places",
        "Checking detours",
        "Calculating your route",
        "Updating your route",
      ].map((title) => (
        <StatusCard key={title} title={title} loading />
      ))}
      <StatusCard
        title="Location access is off"
        detail="Allow location to plan your route."
        action="Sample action"
        onPress={() => {}}
      />
      <StatusCard
        title="ROAM couldn’t reach the service"
        detail="Your trip is kept. Try again."
      />
      <Eyebrow>RESULTS / EMPTY / LONG CONTENT</Eyebrow>
      <PlaceList
        places={[
          sample,
          {
            ...sample,
            id: "long-review",
            name: "A longer sample destination name that should wrap naturally across small iPhone widths",
            subtitle:
              "An address with enough detail to check two-line clipping and touch targets",
          },
        ]}
        numbered
        actionLabel="Sample action"
        onSelect={() => {}}
      />
      <SuggestionsList
        suggestions={[
          {
            id: "review",
            name: "A sample destination",
            subtitle: "Review fixture · no route is created",
            source: "mock",
          },
        ]}
        disabled={false}
        onSelect={() => {}}
      />
      <StatusCard
        title="No places found"
        detail="Try a different name or category."
      />
      <Text style={{ ...type.small, color: colors.muted }}>
        Review the real Map, Trips, assistant and search on a configured
        development device. Check 360 / 375 / 430-point widths, both themes,
        larger text, reduced motion, keyboard and safe areas. Fixtures do not
        establish physical-device validation.
      </Text>
    </Page>
  );
}
