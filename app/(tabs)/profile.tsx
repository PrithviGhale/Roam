import { Pressable, Text, View } from "react-native";
import { Page } from "../../components/Page";
import { Eyebrow, Icon, Panel, Button } from "../../components/ui";
import { useTheme } from "../../themes/ThemeProvider";
import { useRoam } from "../../contexts/RoamProvider";
import { router } from "expo-router";

export default function ProfileScreen() {
  const { theme, setTheme } = useTheme();
  const { colors } = theme;
  const { status, canAskAgain, retry, fresh } = useRoam();
  return (
    <Page
      title="Make it your road."
      subtitle="A little personality for every journey."
    >
      <Panel style={{ flexDirection: "row", alignItems: "center", gap: 15 }}>
        <View
          style={{
            width: 55,
            height: 55,
            borderRadius: 20,
            backgroundColor: colors.accentSoft,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="person-outline" color={colors.accent} size={25} />
        </View>
        <View style={{ gap: 6 }}>
          <Text style={{ color: colors.text, fontWeight: "600", fontSize: 18 }}>
            Hello, explorer.
          </Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            Local prototype · No account needed
          </Text>
        </View>
      </Panel>
      <View style={{ gap: 13 }}>
        <Eyebrow>MAP PERSONALITY</Eyebrow>
        {(["dark", "light"] as const).map((id) => (
          <Pressable
            key={id}
            accessibilityRole="radio"
            accessibilityState={{ checked: theme.id === id }}
            onPress={() => setTheme(id)}
            style={{
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: theme.id === id ? colors.accent : colors.border,
              borderRadius: 20,
              padding: 18,
              minHeight: 82,
              flexDirection: "row",
              alignItems: "center",
              gap: 14,
            }}
          >
            <Icon
              name={id === "dark" ? "moon-outline" : "sunny-outline"}
              color={colors.accent}
            />
            <View style={{ flex: 1, gap: 5 }}>
              <Text
                style={{ color: colors.text, fontSize: 16, fontWeight: "600" }}
              >
                ROAM {id === "dark" ? "Dark" : "Light"}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                {id === "dark"
                  ? "Graphite. Calm. After-hours."
                  : "Fresh. Clear. Open skies."}
              </Text>
            </View>
            {theme.id === id && (
              <Icon name="checkmark-circle" color={colors.accent} />
            )}
          </Pressable>
        ))}
      </View>
      <Panel style={{ gap: 13 }}>
        <Eyebrow>LOCATION</Eyebrow>
        <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}>
          {status === "ready" && fresh
            ? "Connected to your GPS"
            : status === "denied"
              ? "Location access is off"
              : "Waiting for location"}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 20 }}>
          ROAM uses location while the app is open. Google receives location
          when you request places or routes. When Gemini is configured, your
          message and a compact trip summary go through the ROAM backend to
          Google AI. No GPS history or route polyline is sent to Gemini. There
          is no long-term app conversation or location-history storage.
        </Text>
        {(status !== "ready" || !fresh) && (
          <Button secondary onPress={retry}>
            {status === "denied" && !canAskAgain
              ? "Open Settings"
              : "Retry location"}
          </Button>
        )}
      </Panel>
      <View style={{ gap: 10 }}>
        {__DEV__ && (
          <Button
            secondary
            icon="construct-outline"
            onPress={() => router.push("/diagnostics")}
          >
            Device diagnostics
          </Button>
        )}
        <Eyebrow>BUILT FOR WHAT’S AHEAD</Eyebrow>
        <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 21 }}>
          Real places and trip tools are ready for Gemini through your backend.
          Push-to-talk needs a development build; text input works in Expo Go.
          Full navigation is a future chapter.
        </Text>
        <Text style={{ color: colors.accent, fontSize: 12, fontWeight: "600" }}>
          ROAM 0.4.0 · Your AI for the road.
        </Text>
      </View>
    </Page>
  );
}
