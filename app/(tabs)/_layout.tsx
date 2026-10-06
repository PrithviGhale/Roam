import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../themes/ThemeProvider";
import { Icon } from "../../components/ui";

export default function TabLayout() {
  const {
    theme: { colors },
  } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          height: 65 + Math.max(insets.bottom, 10),
          paddingTop: 9,
          paddingBottom: Math.max(insets.bottom, 10),
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: "600", marginTop: 2 },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Map",
          tabBarIcon: ({ color }) => (
            <Icon name="map-outline" color={color} size={22} />
          ),
        }}
      />
      <Tabs.Screen
        name="trips"
        options={{
          title: "Trips",
          tabBarIcon: ({ color }) => (
            <Icon name="trail-sign-outline" color={color} size={22} />
          ),
        }}
      />
      <Tabs.Screen
        name="roam"
        options={{
          title: "ROAM",
          tabBarIcon: ({ color }) => (
            <Icon name="sparkles-outline" color={color} size={22} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color }) => (
            <Icon name="person-circle-outline" color={color} size={24} />
          ),
        }}
      />
    </Tabs>
  );
}
