import type { Coordinate } from "../types/domain";

const radians = (degrees: number) => (degrees * Math.PI) / 180;
const longitudeDelta = (from: number, to: number) =>
  ((to - from + 540) % 360) - 180;
export function distanceBetween(a: Coordinate, b: Coordinate): number {
  const latitude = radians(b.latitude - a.latitude),
    longitude = radians(longitudeDelta(a.longitude, b.longitude));
  const h =
    Math.sin(latitude / 2) ** 2 +
    Math.cos(radians(a.latitude)) *
      Math.cos(radians(b.latitude)) *
      Math.sin(longitude / 2) ** 2;
  return (
    6371000 *
    2 *
    Math.atan2(Math.sqrt(Math.min(1, h)), Math.sqrt(Math.max(0, 1 - h)))
  );
}
export function interpolate(
  a: Coordinate,
  b: Coordinate,
  fraction: number,
): Coordinate {
  const longitude =
    a.longitude + longitudeDelta(a.longitude, b.longitude) * fraction;
  return {
    latitude: a.latitude + (b.latitude - a.latitude) * fraction,
    longitude: ((longitude + 540) % 360) - 180,
  };
}
export function routeLengths(geometry: Coordinate[]): number[] {
  const lengths = [0];
  for (let i = 1; i < geometry.length; i++)
    lengths.push(
      lengths[i - 1]! + distanceBetween(geometry[i - 1]!, geometry[i]!),
    );
  return lengths;
}
export interface RouteProjection {
  progressMeters: number;
  offsetMeters: number;
  totalMeters: number;
  coordinate: Coordinate;
}
export function projectOntoRoute(
  point: Coordinate,
  geometry: Coordinate[],
): RouteProjection | null {
  if (geometry.length < 2) return null;
  const lengths = routeLengths(geometry);
  let best: RouteProjection | null = null;
  for (let i = 1; i < geometry.length; i++) {
    const a = geometry[i - 1]!,
      b = geometry[i]!;
    const scale = Math.cos(radians((a.latitude + b.latitude) / 2));
    const dx = longitudeDelta(a.longitude, b.longitude) * scale,
      dy = b.latitude - a.latitude;
    const px = longitudeDelta(a.longitude, point.longitude) * scale,
      py = point.latitude - a.latitude;
    const lengthSquared = dx * dx + dy * dy;
    const fraction = lengthSquared
      ? Math.max(0, Math.min(1, (px * dx + py * dy) / lengthSquared))
      : 0;
    const coordinate = interpolate(a, b, fraction),
      offsetMeters = distanceBetween(point, coordinate);
    if (!best || offsetMeters < best.offsetMeters)
      best = {
        progressMeters:
          lengths[i - 1]! + (lengths[i]! - lengths[i - 1]!) * fraction,
        offsetMeters,
        totalMeters: lengths.at(-1)!,
        coordinate,
      };
  }
  return best;
}
export function pointAlongRoute(
  geometry: Coordinate[],
  targetMeters: number,
): Coordinate | null {
  const lengths = routeLengths(geometry);
  for (let i = 1; i < geometry.length; i++)
    if (lengths[i]! >= targetMeters)
      return interpolate(
        geometry[i - 1]!,
        geometry[i]!,
        (targetMeters - lengths[i - 1]!) /
          Math.max(1, lengths[i]! - lengths[i - 1]!),
      );
  return geometry.at(-1) ?? null;
}
