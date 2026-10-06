import Ionicons from "@expo/vector-icons/Ionicons";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useTheme } from "../themes/ThemeProvider";
import type { ComponentProps, PropsWithChildren } from "react";

export type IconName = ComponentProps<typeof Ionicons>["name"];
export function Icon({
  name,
  size = 22,
  color,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  const { theme } = useTheme();
  return (
    <Ionicons name={name} size={size} color={color ?? theme.colors.text} />
  );
}
export function IconButton({
  icon,
  label,
  onPress,
  active = false,
  style,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  active?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const {
    theme: { colors },
  } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        {
          backgroundColor: active ? colors.accent : colors.surface,
          borderColor: colors.border,
          opacity: pressed ? 0.7 : 1,
        },
        style,
      ]}
    >
      <Icon name={icon} color={active ? colors.onAccent : colors.text} />
    </Pressable>
  );
}
export function Button({
  children,
  onPress,
  icon,
  secondary = false,
  disabled = false,
}: PropsWithChildren<{
  onPress: () => void;
  icon?: IconName;
  secondary?: boolean;
  disabled?: boolean;
}>) {
  const {
    theme: { colors },
  } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: secondary ? colors.elevated : colors.accent,
          opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
        },
      ]}
    >
      {icon && (
        <Icon
          name={icon}
          size={20}
          color={secondary ? colors.text : colors.onAccent}
        />
      )}
      <Text
        style={{
          fontSize: 15,
          fontWeight: "700",
          color: secondary ? colors.text : colors.onAccent,
        }}
      >
        {children}
      </Text>
    </Pressable>
  );
}
export function Panel({
  children,
  style,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  const {
    theme: { colors },
  } = useTheme();
  return (
    <View
      style={[
        styles.panel,
        { backgroundColor: colors.surface, borderColor: colors.border },
        style,
      ]}
    >
      {children}
    </View>
  );
}
export function Eyebrow({ children }: PropsWithChildren) {
  const {
    theme: { colors },
  } = useTheme();
  return (
    <Text
      style={{
        color: colors.muted,
        fontSize: 10,
        fontWeight: "700",
        letterSpacing: 2,
      }}
    >
      {children}
    </Text>
  );
}
const styles = StyleSheet.create({
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  button: {
    minHeight: 50,
    borderRadius: 16,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  panel: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 18,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 5 },
    shadowRadius: 18,
    elevation: 4,
  },
});
