import type { BottomTabBarProps } from "expo-router/tabs";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../themes/ThemeProvider";
import { useAssistant } from "../contexts/AssistantProvider";
import { Icon, type IconName } from "./ui";
import { RoamPulse, voiceLabels } from "./RoamPulse";
import { radius, space, type } from "../design/tokens";
const icons: Record<string, IconName> = {
  index: "map-outline",
  trips: "trail-sign-outline",
  profile: "person-outline",
};
const labels: Record<string, string> = {
  index: "Map",
  trips: "Trips",
  roam: "ROAM",
  profile: "Profile",
};
export function RoamTabBar({ state, navigation }: BottomTabBarProps) {
  const {
    theme: { colors },
  } = useTheme();
  const insets = useSafeAreaInsets();
  const assistant = useAssistant();
  return (
    <View
      style={{
        backgroundColor: colors.background,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        paddingTop: space.xs,
        paddingBottom: Math.max(insets.bottom, space.xs),
        paddingLeft: insets.left + space.xs,
        paddingRight: insets.right + space.xs,
        flexDirection: "row",
      }}
    >
      {state.routes.map((route, index) => {
        const selected = state.index === index;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityLabel={
              route.name === "roam"
                ? `ROAM, ${voiceLabels[assistant.voicePhase]}`
                : labels[route.name]
            }
            accessibilityState={{ selected }}
            onPress={() => {
              const event = navigation.emit({
                type: "tabPress",
                target: route.key,
                canPreventDefault: true,
              });
              if (!selected && !event.defaultPrevented)
                navigation.navigate(route.name, route.params);
            }}
            onLongPress={() =>
              navigation.emit({ type: "tabLongPress", target: route.key })
            }
            style={{
              flex: 1,
              minHeight: 56,
              alignItems: "center",
              justifyContent: "center",
              gap: space.xxs,
              borderRadius: radius.md,
              backgroundColor: selected ? colors.selected : colors.background,
            }}
          >
            {route.name === "roam" ? (
              <RoamPulse phase={assistant.voicePhase} size={24} />
            ) : (
              <Icon
                name={icons[route.name] ?? "ellipse-outline"}
                size={20}
                color={selected ? colors.accent : colors.muted}
              />
            )}
            <Text
              style={{
                ...type.small,
                fontWeight: selected ? "600" : "400",
                color: selected ? colors.accent : colors.muted,
              }}
            >
              {labels[route.name]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
