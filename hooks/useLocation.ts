import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking } from "react-native";
import * as Location from "expo-location";
import { validCoordinate } from "../utils/location";

import { SpeedFilter, HeadingFilter } from "../utils/motionFilter";

export type LocationStatus =
  "requesting" | "denied" | "locating" | "ready" | "unavailable";
export function useLocation() {
  const [location, setLocation] = useState<Location.LocationObject | null>(
    null,
  );
  const [filteredSpeed, setFilteredSpeed] = useState<number | null>(null);
  const speedFilter = useRef(new SpeedFilter());
  const headingFilter = useRef(new HeadingFilter());
  const askPermission = useRef(false);
  const [permissionStatus, setPermissionStatus] = useState("undetermined");
  const gpsTime = useRef({ accumulated: 0, since: null as number | null });
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
      headingFilter.current.reset();
      return;
    }
    let cancelled = false;
    let positionSubscription: Location.LocationSubscription | undefined;
    let fixTimer: ReturnType<typeof setTimeout> | undefined;
    const receive = (value: Location.LocationObject) => {
      if (
        cancelled ||
        !validCoordinate(value.coords) ||
        !Number.isFinite(value.timestamp) ||
        Date.now() - value.timestamp > 15000 ||
        value.timestamp > Date.now() + 1000
      )
        return;
      clearTimeout(fixTimer);
      setLocation(value);
      setFilteredSpeed(
        speedFilter.current.update({
          speed: value.coords.speed,
          accuracy: value.coords.accuracy,
          timestamp: value.timestamp,
        }),
      );
      headingFilter.current.update(
        value.coords.heading,
        value.coords.speed,
        value.coords.accuracy,
        value.timestamp,
      );
      setNow(Date.now());
      setStatus("ready");
      setError(null);
    };
    const start = async () => {
      setStatus("requesting");
      setError(null);
      setLocation(null);
      speedFilter.current.reset();
      headingFilter.current.reset();
      setFilteredSpeed(null);
      try {
        let permission = await Location.getForegroundPermissionsAsync();
        if (cancelled) return;
        if (
          !permission.granted &&
          permission.canAskAgain &&
          askPermission.current
        )
          permission = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        setCanAskAgain(permission.canAskAgain);
        setPermissionStatus(permission.status);
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
              void Location.getForegroundPermissionsAsync()
                .then((permission) => {
                  if (cancelled) return;
                  setPermissionStatus(permission.status);
                  setCanAskAgain(permission.canAskAgain);
                  if (!permission.granted) {
                    positionSubscription?.remove();
                    setLocation(null);
                    setStatus("denied");
                  }
                })
                .catch(() => {});
            }
          },
        );
        if (cancelled) {
          subscription.remove();
          return;
        }
        positionSubscription = subscription;
        gpsTime.current.since = Date.now();
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
      if (gpsTime.current.since !== null)
        gpsTime.current.accumulated += Math.max(
          0,
          Date.now() - gpsTime.current.since,
        );
      gpsTime.current.since = null;
    };
  }, [attempt, active]);
  const retry = useCallback(() => {
    askPermission.current = true;
    if (!canAskAgain && status === "denied") {
      void Linking.openSettings().catch(() =>
        setError("Open iPhone Settings to allow location for ROAM."),
      );
    } else setAttempt((value) => value + 1);
  }, [canAskAgain, status]);
  const fresh =
    active &&
    location !== null &&
    now - location.timestamp <= 15000 &&
    location.timestamp <= now + 1000;
  const speedMph = fresh && status === "ready" ? filteredSpeed : null;
  return {
    coordinate: location?.coords ?? null,
    speedMph,
    heading:
      fresh &&
      status === "ready" &&
      location &&
      now - location.timestamp <= 10000
        ? headingFilter.current.current(now)
        : null,
    status,
    error,
    canAskAgain,
    retry,
    fresh,
    accuracy: location?.coords.accuracy ?? null,
    timestamp: location?.timestamp ?? null,
    rawSpeed: location?.coords.speed ?? null,
    permissionStatus,
    gpsSessionMs:
      gpsTime.current.accumulated +
      (gpsTime.current.since === null
        ? 0
        : Math.max(0, now - gpsTime.current.since)),
  };
}
