import { router } from "expo-router";
import { Text, View } from "react-native";
import { Page } from "../../components/Page";
import { Button, Eyebrow, Icon, Panel } from "../../components/ui";
import { useTheme } from "../../themes/ThemeProvider";
import { useRoam } from "../../contexts/RoamProvider";

export default function TripsScreen() {
  const {
    theme: { colors },
  } = useTheme();
  const { destination } = useRoam();
  return (
    <Page
      title="Every road has a story."
      subtitle="Your journeys will live here. Let’s start with somewhere new."
    >
      {destination && (
        <Panel style={{ gap: 12 }}>
          <Eyebrow>YOUR DESTINATION PREVIEW</Eyebrow>
          <Text style={{ color: colors.text, fontSize: 22, fontWeight: "600" }}>
            {destination.name}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 13 }}>
            Demo destination · No active navigation
          </Text>
          <Button secondary onPress={() => router.navigate("/")}>
            Back to map
          </Button>
        </Panel>
      )}
      <Panel style={{ alignItems: "center", paddingVertical: 35, gap: 19 }}>
        <View
          style={{
            width: 75,
            height: 75,
            borderRadius: 25,
            backgroundColor: colors.accentSoft,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Icon name="trail-sign-outline" size={32} color={colors.accent} />
        </View>
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: "600" }}>
          A fresh start
        </Text>
        <Text
          style={{
            color: colors.muted,
            fontSize: 13,
            lineHeight: 21,
            textAlign: "center",
          }}
        >
          Trip history and saved places are coming in a future version. For now,
          explore the map and try a destination preview.
        </Text>
        <Button icon="map-outline" onPress={() => router.navigate("/")}>
          Explore the map
        </Button>
      </Panel>
      <Eyebrow>MORE MILES. MORE MEMORIES.</Eyebrow>
    </Page>
  );
}
