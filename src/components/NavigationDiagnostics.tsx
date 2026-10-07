import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useRoam } from "../contexts/RoamProvider";
import { useTheme } from "../themes/ThemeProvider";
import { Button, Eyebrow } from "./ui";
import { drivingDistance } from "../services/navigation/NavigationController";
export function NavigationDiagnostics() {
  const { navigation: n, navigator } = useRoam();
  const {
    theme: { colors },
  } = useTheme();
  const [availability, setAvailability] = useState("Checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void navigator.available().then((a) => {
      if (active)
        setAvailability(
          a.available
            ? `Available · ${a.version ?? ""}`
            : `Disabled/unavailable · ${a.reason ?? ""}`,
        );
    });
    return () => {
      active = false;
    };
  }, [navigator]);
  const simulate = async (enabled: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await navigator.simulate(enabled);
    } catch {
      setError("Simulation could not start. Check the native build.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: 10 }}>
      <Eyebrow>NATIVE NAVIGATION · SESSION ONLY</Eyebrow>
      <Text style={{ color: colors.text }}>
        SDK: {availability}
        {"\n"}Session: {n.mode}
        {"\n"}Guidance: {n.guidance ? "Received" : "Waiting"}
        {"\n"}Current road: {n.currentRoad ?? "Not exposed by this feed"}
        {"\n"}Next: {n.guidance?.maneuver ?? "—"}
        {"\n"}Distance:{" "}
        {drivingDistance(n.guidance?.distanceToManeuverMeters ?? NaN)}
        {"\n"}Road-snapped fix: {n.location ? "Received" : "Unavailable"}
        {"\n"}Rerouting: {n.rerouting ? "Yes" : "No"}
        {"\n"}Waypoint: {n.waypointId ?? "En route"}
        {"\n"}Camera: {n.camera}
        {"\n"}Last guidance:{" "}
        {n.updatedAt ? new Date(n.updatedAt).toLocaleTimeString() : "—"}
      </Text>
      {__DEV__ && n.mode === "native" && (
        <>
          <Button disabled={busy} onPress={() => void simulate(true)}>
            Simulate current route
          </Button>
          <Button
            secondary
            disabled={busy}
            onPress={() => void simulate(false)}
          >
            Stop simulation
          </Button>
        </>
      )}
      {error && <Text style={{ color: colors.text }}>{error}</Text>}
      {n.events.slice(-10).map((e, i) => (
        <Text key={i} style={{ color: colors.muted, fontSize: 12 }}>
          {new Date(e.timestamp).toLocaleTimeString()} · {e.label}
        </Text>
      ))}
    </View>
  );
}
