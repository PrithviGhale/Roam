import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../themes/ThemeProvider";
import { IconButton } from "./ui";
import type { PropsWithChildren } from "react";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { radius, space } from "../design/tokens";

export function BottomSheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  tall = false,
}: PropsWithChildren<{
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  tall?: boolean;
}>) {
  const {
    theme: { colors },
  } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const reduced = useReducedMotion();
  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduced ? "none" : "slide"}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss sheet"
          onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]}
        />
        <View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              backgroundColor: colors.background,
              borderColor: colors.border,
              paddingBottom: Math.max(insets.bottom, 16),
              maxHeight: height - insets.top - space.md,
            },
            tall && ({ height: height * 0.8 } as ViewStyle),
          ]}
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <View style={styles.header}>
            <View style={{ flex: 1, gap: 5 }}>
              <Text
                accessibilityRole="header"
                style={{ color: colors.text, fontSize: 23, fontWeight: "700" }}
              >
                {title}
              </Text>
              {subtitle && (
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  {subtitle}
                </Text>
              )}
            </View>
            <IconButton icon="close" label="Close sheet" onPress={onClose} />
          </View>
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    width: "100%",
    maxWidth: 560,
    flexShrink: 1,
    minHeight: 0,
    alignSelf: "center",
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    paddingHorizontal: space.md,
    paddingTop: space.sm,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 4,
    alignSelf: "center",
    marginBottom: space.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: space.md,
  },
});
