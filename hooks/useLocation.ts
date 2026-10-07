import { useCallback, useEffect, useState } from "react";
import { AppState, Linking } from "react-native";
import * as Location from "expo-location";
import { speedInMph, validCoordinate } from "../utils/location";

export type LocationStatus =
  "requesting" | "denied" | "locating" | "ready" | "unavailable";
export function useLocation() {
  const [location, setLocation] = useState<Location.LocationObject | null>(
    null,
  );
  const [heading, setHeading] = useState<number | null>(null);
  const [status, setStatus] = useState<LocationStatus>("requesting");
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [active, setActive] = useState(AppState.currentState === "active");
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) =>
      setActive(state === "active"),
    );
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 3000);
    return () => clearInterval(timer);
  }, [active]);
  useEffect(() => {
    if (!active) {
      setHeading(null);
      return;
    }
    let cancelled = false;
    let positionSubscription: Location.LocationSubscription | undefined;
    let headingSubscription: Location.LocationSubscription | undefined;
    let fixTimer: ReturnType<typeof setTimeout> | undefined;
    const receive = (value: Location.LocationObject) => {
      if (cancelled || !validCoordinate(value.coords)) return;
      clearTimeout(fixTimer);
      setLocation(value);
      setNow(Date.now());
      setStatus("ready");
      setError(null);
    };
    const start = async () => {
      setStatus("requesting");
      setError(null);
      setLocation(null);
      try {
        let permission = await Location.getForegroundPermissionsAsync();
        if (cancelled) return;
        if (!permission.granted && permission.canAskAgain)
          permission = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        setCanAskAgain(permission.canAskAgain);
        if (!permission.granted) {
          setStatus("denied");
          return;
        }
        if (!(await Location.hasServicesEnabledAsync())) {
          if (!cancelled) {
            setStatus("unavailable");
            setError(
              "Location services are turned off. Enable them in Settings, then retry.",
            );
          }
          return;
        }
        if (cancelled) return;
        setStatus("locating");
        fixTimer = setTimeout(() => {
          if (!cancelled) {
            setStatus("unavailable");
            setError(
              "Waiting for a GPS signal. Try moving to an open area or retry.",
            );
          }
        }, 15000);
        const subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            distanceInterval: 0,
            timeInterval: 1500,
          },
          receive,
          () => {
            if (!cancelled) {
              setStatus("unavailable");
              setError("GPS updates were interrupted. Retry to reconnect.");
            }
          },
        );
        if (cancelled) {
          subscription.remove();
          return;
        }
        positionSubscription = subscription;
        try {
          const compass = await Location.watchHeadingAsync((value) => {
            if (cancelled) return;
            const degrees =
              value.trueHeading >= 0 ? value.trueHeading : value.magHeading;
            setHeading(
              value.accuracy > 0 &&
                Number.isFinite(degrees) &&
                degrees >= 0 &&
                degrees < 360
                ? degrees
                : null,
            );
          });
          if (cancelled) compass.remove();
          else headingSubscription = compass;
        } catch {
          /* Compass availability is independent of GPS permission. */
        }
      } catch {
        if (!cancelled) {
          setStatus("unavailable");
          setError("ROAM couldn’t access your location. Please retry.");
        }
      }
    };
    void start();
    return () => {
      cancelled = true;
      clearTimeout(fixTimer);
      positionSubscription?.remove();
      headingSubscription?.remove();
    };
  }, [attempt, active]);
  const retry = useCallback(() => {
    if (!canAskAgain && status === "denied") {
      void Linking.openSettings().catch(() =>
        setError(
          "Open your phone’s Settings to allow location for Expo Go or ROAM.",
        ),
      );
    } else setAttempt((value) => value + 1);
  }, [canAskAgain, status]);
  const fresh =
    active && location !== null && now - location.timestamp <= 15000;
  const speedMph =
    fresh && status === "ready"
      ? speedInMph(
          location
            ? {
                speed: location.coords.speed,
                accuracy: location.coords.accuracy,
                timestamp: location.timestamp,
              }
            : null,
          now,
        )
      : null;
  return {
    coordinate: location?.coords ?? null,
    speedMph,
    heading,
    status,
    error,
    canAskAgain,
    retry,
    fresh,
    accuracy: location?.coords.accuracy ?? null,
    timestamp: location?.timestamp ?? null,
    rawSpeed: location?.coords.speed ?? null,
    permissionStatus:
      status === "denied" ? "denied" : location ? "granted" : status,
  };
}
