import { z } from "zod";
import type { ActiveTrip, Place } from "../types/domain";
const place = z.object({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(300),
  subtitle: z.string().max(500),
  source: z.literal("verified"),
  category: z.enum([
    "destination",
    "food",
    "gas",
    "restroom",
    "coffee",
    "parking",
  ]),
  coordinate: z.object({
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
  }),
});
const schema = z.object({
  version: z.literal(1),
  savedAt: z.number().finite(),
  destination: place,
  stops: z.array(place).max(5),
});
export type RecoveredPlan = z.infer<typeof schema>;
const minimal = (value: Place) => place.parse(value);
export function encodeRecovery(
  trip: ActiveTrip,
  now = Date.now(),
): string | null {
  if (!trip.startedAt || trip.destination.source !== "verified") return null;
  try {
    return JSON.stringify({
      version: 1,
      savedAt: now,
      destination: minimal(trip.destination),
      stops: trip.stops
        .filter((stop) => !stop.visited)
        .map((stop) => minimal(stop.place)),
    });
  } catch {
    return null;
  }
}
export function decodeRecovery(
  value: string | null,
  now = Date.now(),
): RecoveredPlan | null {
  if (!value || value.length > 12000) return null;
  try {
    const result = schema.parse(JSON.parse(value));
    if (
      now - result.savedAt > 6 * 3600000 ||
      result.savedAt > now + 1000 ||
      new Set([result.destination.id, ...result.stops.map((stop) => stop.id)])
        .size !==
        result.stops.length + 1
    )
      return null;
    return result;
  } catch {
    return null;
  }
}
