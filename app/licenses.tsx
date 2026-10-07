import { useEffect, useState } from "react";
import { Text } from "react-native";
import { Page } from "../src/components/Page";
import { useRoam } from "../src/contexts/RoamProvider";
import { useTheme } from "../src/themes/ThemeProvider";
export default function Licenses() {
  const { navigator } = useRoam();
  const {
    theme: { colors },
  } = useTheme();
  const [text, setText] = useState("Loading licenses…");
  useEffect(() => {
    let active = true;
    void navigator
      .licenses()
      .then((value) => {
        if (active) setText(value);
      })
      .catch(() => {
        if (active) setText("Licenses are unavailable in this build.");
      });
    return () => {
      active = false;
    };
  }, [navigator]);
  return (
    <Page
      title="Maps licenses"
      subtitle="Google Maps and Navigation open-source notices"
    >
      <Text
        selectable
        style={{ color: colors.text, fontSize: 13, lineHeight: 20 }}
      >
        {text}
      </Text>
    </Page>
  );
}
