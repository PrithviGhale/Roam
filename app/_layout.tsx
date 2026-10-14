import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider, useTheme } from "../src/themes/ThemeProvider";
import { RoamProvider } from "../src/contexts/RoamProvider";
import { AssistantProvider } from "../src/contexts/AssistantProvider";
import { PowerProvider } from "../src/contexts/PowerProvider";
import { MapThemeProvider } from "../src/map/MapThemeProvider";
import { LaunchTransition } from "../src/components/LaunchTransition";
import * as SplashScreen from "expo-splash-screen";
void SplashScreen.preventAutoHideAsync().catch(() => {});

export { ErrorBoundary } from "expo-router";

function RootNavigator() {
  const { theme } = useTheme();
  return (
    <>
      <StatusBar style={theme.id === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" />
      </Stack>
      <LaunchTransition />
    </>
  );
}
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <MapThemeProvider>
          <PowerProvider>
            <RoamProvider>
              <AssistantProvider>
                <RootNavigator />
              </AssistantProvider>
            </RoamProvider>
          </PowerProvider>
        </MapThemeProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
