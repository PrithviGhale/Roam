import { Linking, Pressable, Text, View } from "react-native";
import { useTheme } from "../themes/ThemeProvider";
import type { Place } from "../types/domain";

export function GoogleAttribution({
  places = [],
  compact = false,
}: {
  places?: Place[];
  compact?: boolean;
}) {
  const { theme } = useTheme();
  const providers = [
    ...new Map(
      places
        .flatMap((place) => place.attributions ?? [])
        .map((provider) => [provider.provider, provider]),
    ).values(),
  ];
  return (
    <View style={{ gap: 6, paddingVertical: compact ? 0 : 10 }}>
      <Text
        accessibilityLabel="Data provided by Google Maps"
        style={{
          color: theme.id === "dark" ? "#FFFFFF" : "#1F1F1F",
          fontSize: 12,
          fontWeight: "400",
        }}
      >
        Google Maps
      </Text>
      {providers.map((provider) => (
        <Pressable
          key={provider.provider}
          accessibilityRole={
            provider.uri?.startsWith("https://") ? "link" : "text"
          }
          onPress={() => {
            if (provider.uri?.startsWith("https://"))
              void Linking.openURL(provider.uri).catch(() => {});
          }}
          style={{ minHeight: 24 }}
        >
          <Text style={{ color: theme.colors.muted, fontSize: 11 }}>
            {provider.provider}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
