import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useRoam } from "../contexts/RoamProvider";
import { useTheme } from "../themes/ThemeProvider";
import { drivingDistance } from "../services/navigation/NavigationController";
import type { Maneuver } from "../../modules/roam-navigation/src/types";
import { Button } from "./ui";
import { radius, space, type } from "../design/tokens";
import { GoogleAttribution } from "./GoogleAttribution";

// Original line geometry in a 48-point square; no provider icon assets.
export function ManeuverGlyph({
  maneuver,
  color,
}: {
  maneuver: Maneuver;
  color: string;
}) {
  const left = /Left|left/.test(maneuver);
  const points: [number, number][] =
    maneuver === "uTurn"
      ? [
          [32, 42],
          [32, 14],
          [12, 14],
          [12, 30],
        ]
      : maneuver === "merge"
        ? [
            [10, 42],
            [24, 28],
            [24, 6],
          ]
        : maneuver === "roundabout"
          ? [
              [24, 44],
              [24, 33],
              [10, 24],
              [24, 10],
              [36, 22],
              [24, 33],
              [40, 10],
            ]
          : maneuver === "arrive"
            ? [
                [12, 44],
                [12, 8],
                [36, 8],
                [36, 23],
                [12, 23],
              ]
            : maneuver === "straight" || maneuver === "unknown"
              ? [
                  [24, 44],
                  [24, 6],
                ]
              : maneuver.startsWith("slight") ||
                  maneuver.startsWith("fork") ||
                  maneuver.startsWith("exit")
                ? [
                    [24, 44],
                    [24, 28],
                    [left ? 8 : 40, 8],
                  ]
                : maneuver.startsWith("sharp")
                  ? [
                      [24, 44],
                      [24, 16],
                      [left ? 6 : 42, 30],
                    ]
                  : [
                      [24, 44],
                      [24, 15],
                      [left ? 7 : 41, 15],
                    ];
  const [lastX, lastY] = points.at(-1)!;
  const [prevX, prevY] = points.at(-2)!;
  const angle = Math.atan2(lastY - prevY, lastX - prevX);
  const lines = [...points];
  const segments = lines.slice(1).map((point, i) => [lines[i]!, point]);
  if (maneuver !== "arrive") {
    segments.push([
      [lastX - 10 * Math.cos(angle - 0.6), lastY - 10 * Math.sin(angle - 0.6)],
      [lastX, lastY],
    ]);
    segments.push([
      [lastX - 10 * Math.cos(angle + 0.6), lastY - 10 * Math.sin(angle + 0.6)],
      [lastX, lastY],
    ]);
  }
  if (maneuver.startsWith("fork") || maneuver.startsWith("exit"))
    segments.push([
      [24, 28],
      [24, 6],
    ]);
  return (
    <View accessibilityElementsHidden style={{ width: 48, height: 48 }}>
      {segments.map(([a, b], i) => {
        if (!a || !b) return null;
        return (
          <View
            key={i}
            style={{
              position: "absolute",
              left:
                (a[0] + b[0]) / 2 - Math.hypot(b[0] - a[0], b[1] - a[1]) / 2,
              top: (a[1] + b[1]) / 2 - 2,
              width: Math.hypot(b[0] - a[0], b[1] - a[1]),
              height: 4,
              borderRadius: 2,
              backgroundColor: color,
              transform: [
                { rotate: `${Math.atan2(b[1] - a[1], b[0] - a[0])}rad` },
              ],
            }}
          />
        );
      })}
    </View>
  );
}
export function ManeuverRail() {
  const {
    navigation: nav,
    tripState,
    continueNavigationStop,
    cancelTrip,
  } = useRoam();
  const {
    theme: { colors },
  } = useTheme();
  const [clock, setClock] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const arrived = nav.mode === "arrived";
  const stop = tripState.trip?.stops.find((s) => s.id === nav.waypointId);
  if (nav.mode !== "native" && !arrived) return null;
  const g = nav.guidance;
  const stale = nav.updatedAt === null || clock - nav.updatedAt > 15000;
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        padding: space.md,
        gap: space.sm,
      }}
    >
      <View
        style={{ flexDirection: "row", alignItems: "center", gap: space.md }}
      >
        <ManeuverGlyph
          maneuver={arrived || stop ? "arrive" : (g?.maneuver ?? "unknown")}
          color={colors.accent}
        />
        <View style={{ flex: 1, gap: space.xs }}>
          <Text style={{ ...type.metric, color: colors.text }}>
            {arrived
              ? "You’ve arrived"
              : stop
                ? "Arrived"
                : nav.rerouting
                  ? "Updating route…"
                  : stale
                    ? "Waiting for guidance"
                    : drivingDistance(g?.distanceToManeuverMeters ?? NaN)}
          </Text>
          <Text style={{ ...type.heading, color: colors.text }}>
            {arrived
              ? tripState.trip?.destination.name
              : stop
                ? stop.place.name
                : g?.roadName || "Your next direction"}
          </Text>
          {!arrived && !stop && g && (
            <Text style={{ ...type.body, color: colors.muted }}>
              {g.instruction}
            </Text>
          )}
          {g?.exitNumber && !arrived && !stop && (
            <Text style={{ ...type.label, color: colors.text }}>
              EXIT {g.exitNumber}
            </Text>
          )}
          {g?.roundaboutExit && !arrived && !stop && (
            <Text style={{ ...type.small, color: colors.text }}>
              Roundabout exit {g.roundaboutExit}
            </Text>
          )}
        </View>
      </View>
      {!arrived && !stop && !nav.rerouting && !stale && g?.next && (
        <Text numberOfLines={2} style={{ ...type.small, color: colors.muted }}>
          Then · {g.next.instruction}
        </Text>
      )}
      {stop && (
        <>
          <Button
            disabled={busy}
            onPress={() => {
              setBusy(true);
              void continueNavigationStop().finally(() => setBusy(false));
            }}
          >
            Continue Trip
          </Button>
          <Button
            secondary
            disabled={busy}
            onPress={() => {
              setBusy(true);
              void continueNavigationStop().finally(() => setBusy(false));
            }}
          >
            Mark Complete
          </Button>
        </>
      )}
      {arrived && (
        <Button secondary onPress={cancelTrip}>
          Done
        </Button>
      )}
      {nav.provider !== "mapbox" && <GoogleAttribution compact />}
    </View>
  );
}
