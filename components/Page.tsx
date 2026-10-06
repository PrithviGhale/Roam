import { ScrollView, Text, View, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../themes/ThemeProvider";
import { Brand } from "./Brand";
import type { PropsWithChildren } from "react";

export function Page({
  title,
  subtitle,
  children,
  scroll = true,
}: PropsWithChildren<{ title: string; subtitle: string; scroll?: boolean }>) {
  const {
    theme: { colors },
  } = useTheme();
  const style: ViewStyle = {
    padding: 22,
    gap: 23,
    ...(scroll ? {} : { flex: 1 }),
  };
  const content = (
    <>
      <Brand />
      <View style={{ gap: 9, marginTop: 10 }}>
        <Text
          accessibilityRole="header"
          style={{
            color: colors.text,
            fontSize: 32,
            fontWeight: "700",
            letterSpacing: -0.8,
          }}
        >
          {title}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 22 }}>
          {subtitle}
        </Text>
      </View>
      {children}
    </>
  );
  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      {scroll ? (
        <ScrollView contentContainerStyle={style}>{content}</ScrollView>
      ) : (
        <View style={style}>{content}</View>
      )}
    </SafeAreaView>
  );
}
