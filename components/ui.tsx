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
import { radius, space, touch, type } from "../design/tokens";

export type IconName = ComponentProps<typeof Ionicons>["name"];
export function Icon({
  name,
  size = 22,
  color,
}: {
  name: IconName;
  size?: number;
  color?: ComponentProps<typeof Ionicons>["color"];
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
  disabled = false,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  active?: boolean;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}) {
  const {
    theme: { colors },
  } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected: active }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        {
          backgroundColor: active ? colors.accent : colors.surface,
          borderColor: colors.border,
          opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
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
      accessibilityState={{ disabled }}
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
        ...type.label,
      }}
    >
      {children}
    </Text>
  );
}
const styles = StyleSheet.create({
  iconButton: {
    width: touch.min,
    height: touch.min,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  button: {
    minHeight: touch.primary,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  panel: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: space.md,
  },
});
