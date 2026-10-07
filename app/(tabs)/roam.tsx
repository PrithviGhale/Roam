import { useState } from "react";
import { router } from "expo-router";
import { KeyboardAvoidingView, Platform } from "react-native";
import { Page } from "../../src/components/Page";
import { RoamAssistant } from "../../src/components/RoamAssistant";
import { PlacesSheet } from "../../src/components/PlacesSheet";
import { useRoam } from "../../src/contexts/RoamProvider";
import { useAssistant } from "../../src/contexts/AssistantProvider";
import type { PlaceCategory } from "../../src/types/domain";

export default function AssistantScreen() {
  const { setDestination } = useRoam();
  const { stopVoice } = useAssistant();
  const [category, setCategory] = useState<PlaceCategory | null>(null);
  const [visible, setVisible] = useState(false);
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      <Page
        title="Along for the ride"
        subtitle="Your journey, with a little help."
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
