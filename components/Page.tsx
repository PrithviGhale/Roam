import { ScrollView, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../themes/ThemeProvider";
import { space, type } from "../design/tokens";
import { phoneLayout } from "../design/layout";
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
  const { width, height } = useWindowDimensions();
  const layout = phoneLayout(width, height);
  const style = {
    width: "100%" as const,
    maxWidth: layout.contentMax,
    alignSelf: "center" as const,
    padding: layout.gutter,
    gap: space.lg,
    ...(scroll ? {} : { flex: 1, minHeight: 0 }),
  };
  const content = (
    <>
      <View style={{ gap: space.xxs }}>
        <Text
          accessibilityRole="header"
          style={{ ...type.title, color: colors.text }}
        >
          {title}
        </Text>
        <Text style={{ ...type.small, color: colors.muted }}>{subtitle}</Text>
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
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          contentContainerStyle={[style, { paddingBottom: space.xxl }]}
        >
          {content}
        </ScrollView>
      ) : (
        <View style={style}>{content}</View>
      )}
    </SafeAreaView>
  );
}
