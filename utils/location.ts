import type { Coordinate } from "../types/domain";

export interface SpeedReading {
  speed: number | null;
  accuracy: number | null;
  timestamp: number;
}
export function speedInMph(
  reading: SpeedReading | null,
  now = Date.now(),
): number | null {
  if (
    !reading ||
    !Number.isFinite(reading.timestamp) ||
    !Number.isFinite(now) ||
    now - reading.timestamp > 15000 ||
    reading.timestamp > now + 5000
  )
    return null;
  const { speed, accuracy } = reading;
  if (speed === null || !Number.isFinite(speed) || speed < 0 || speed > 90)
    return null;
  if (
    accuracy === null ||
    !Number.isFinite(accuracy) ||
    accuracy < 0 ||
    accuracy > 65
  )
    return null;
  return speed < 0.8 ? 0 : Math.round(speed * 2.236936);
}
export function compassLabel(heading: number | null): string {
  if (
    heading === null ||
    !Number.isFinite(heading) ||
    heading < 0 ||
    heading >= 360
  )
    return "—";
  return (
    ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][
      Math.round(heading / 45) % 8
    ] ?? "—"
  );
}
export function validCoordinate(coordinate: Coordinate): boolean {
  return (
    Number.isFinite(coordinate.latitude) &&
    Number.isFinite(coordinate.longitude) &&
    Math.abs(coordinate.latitude) <= 90 &&
    Math.abs(coordinate.longitude) <= 180
  );
}
