import { Tabs } from "expo-router";
import { useTheme } from "../../themes/ThemeProvider";
import { RoamTabBar } from "../../components/RoamTabBar";
export default function TabLayout() {
  const {
    theme: { colors },
  } = useTheme();
  return (
    <Tabs
      tabBar={(props) => <RoamTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Map" }} />
      <Tabs.Screen name="trips" options={{ title: "Trips" }} />
      <Tabs.Screen name="roam" options={{ title: "ROAM" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}
