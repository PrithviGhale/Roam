import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider, useTheme } from "../themes/ThemeProvider";
import { RoamProvider } from "../contexts/RoamProvider";
import { AssistantProvider } from "../contexts/AssistantProvider";
import { PowerProvider } from "../contexts/PowerProvider";

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
    </>
  );
}
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <PowerProvider>
          <RoamProvider>
            <AssistantProvider>
              <RootNavigator />
            </AssistantProvider>
          </RoamProvider>
        </PowerProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
