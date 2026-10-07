import { Text, View } from "react-native";
import { useTheme } from "../themes/ThemeProvider";
import { radius, space, type } from "../design/tokens";
import { Button, Icon } from "./ui";
import { RoamPulse } from "./RoamPulse";
export function StatusCard({
  title,
  detail,
  loading = false,
  action,
  onPress,
}: {
  title: string;
  detail?: string;
  loading?: boolean;
  action?: string;
  onPress?: () => void;
}) {
  const {
    theme: { colors },
  } = useTheme();
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: radius.lg,
        padding: space.md,
        gap: space.sm,
      }}
    >
      <View
        style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}
      >
        {loading ? (
          <RoamPulse phase="usingTool" size={36} />
        ) : (
          <Icon name="information-circle-outline" color={colors.muted} />
        )}
        <View style={{ flex: 1, gap: space.xxs }}>
          <Text style={{ ...type.heading, color: colors.text }}>{title}</Text>
          {detail && (
            <Text style={{ ...type.small, color: colors.muted }}>{detail}</Text>
          )}
        </View>
      </View>
      {action && onPress && (
        <Button secondary onPress={onPress}>
          {action}
        </Button>
      )}
    </View>
  );
}
