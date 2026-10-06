import { useCallback, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { KeyboardAvoidingView, Platform } from "react-native";
import { Page } from "../../components/Page";
import { RoamAssistant } from "../../components/RoamAssistant";
import { PlacesSheet } from "../../components/PlacesSheet";
import { useRoam } from "../../contexts/RoamProvider";
import { useAssistant } from "../../contexts/AssistantProvider";
import type { PlaceCategory } from "../../types/domain";

export default function AssistantScreen() {
  const { setDestination } = useRoam();
  const { stopVoice } = useAssistant();
  const [category, setCategory] = useState<PlaceCategory | null>(null);
  const [visible, setVisible] = useState(false);
  useFocusEffect(useCallback(() => () => stopVoice(), [stopVoice]));
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={75}
    >
      <Page
        title="Meet your co-pilot."
        subtitle="Less searching. More exploring."
        scroll={false}
      >
        <RoamAssistant
          onPlaces={(next) => {
            stopVoice();
            setCategory(next);
            setVisible(true);
          }}
        />
        <PlacesSheet
          visible={visible}
          category={category}
          onClose={() => setVisible(false)}
          onSelect={(place) => {
            setDestination(place);
            setVisible(false);
            router.navigate("/");
          }}
        />
      </Page>
    </KeyboardAvoidingView>
  );
}
