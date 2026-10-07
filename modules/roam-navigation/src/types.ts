import { z } from "zod";

export const maneuvers = [
  "straight",
  "slightLeft",
  "left",
  "sharpLeft",
  "slightRight",
  "right",
  "sharpRight",
  "uTurn",
  "merge",
  "exitLeft",
  "exitRight",
  "forkLeft",
  "forkRight",
  "roundabout",
  "arrive",
  "unknown",
] as const;
export type Maneuver = (typeof maneuvers)[number];
export type CameraMode = "FOLLOW" | "OVERVIEW" | "FREE";
export type RouteProvider = "mapbox" | "google" | "fallback";
export const coordinateSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
});
export const nativeRouteSchema = z.object({
  id: z.string().min(1),
  provider: z.literal("mapbox"),
  geometry: z.array(coordinateSchema).min(2).max(50000),
  distanceMeters: z.number().finite().positive(),
  durationSeconds: z.number().finite().nonnegative(),
  legs: z
    .array(
      z.object({
        distanceMeters: z.number().finite().nonnegative(),
        durationSeconds: z.number().finite().nonnegative(),
        start: coordinateSchema,
        end: coordinateSchema,
      }),
    )
    .min(1)
    .max(6),
  calculatedAt: z.string().datetime({ offset: true }),
});
const stepSchema = z.object({
  maneuver: z.enum(maneuvers),
  instruction: z.string().max(1000),
  roadName: z.string().max(300),
  step: z.number().int().min(0),
  exitNumber: z.string().max(100).optional(),
  roundaboutExit: z.number().int().positive().optional(),
});
export const guidanceSchema = stepSchema.extend({
  distanceToManeuverMeters: z.number().finite().nonnegative(),
  remainingDistanceMeters: z.number().finite().nonnegative(),
  remainingDurationSeconds: z.number().finite().nonnegative(),
  fractionTraveled: z.number().finite().min(0).max(1).optional(),
  distanceTraveledMeters: z.number().finite().nonnegative().optional(),
  leg: z.number().int().nonnegative().optional(),
  next: stepSchema.optional(),
});
export type Guidance = z.infer<typeof guidanceSchema>;
export const eventKinds = [
  "started",
  "stopped",
  "guidance",
  "rerouting",
  "route",
  "location",
  "road",
  "waypoint",
  "arrival",
  "error",
  "voice",
  "rerouted",
] as const;
export const eventSchema = z.object({
  session: z.string(),
  sequence: z.number().int().nonnegative(),
  timestamp: z.number().finite(),
  kind: z.enum(eventKinds),
  provider: z.enum(["mapbox", "google", "fallback"]).optional(),
  voice: z
    .object({ text: z.string().min(1).max(1000), critical: z.boolean() })
    .optional(),
  guidance: guidanceSchema.optional(),
  geometry: z.array(coordinateSchema).max(50000).optional(),
  route: nativeRouteSchema.optional(),
  location: coordinateSchema
    .extend({ heading: z.number().finite().optional() })
    .optional(),
  road: z.string().max(300).optional(),
  waypointId: z.string().optional(),
  message: z.string().max(300).optional(),
});
export type NavigationEvent = z.infer<typeof eventSchema>;
export interface Waypoint {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}
export interface NativeNavigation {
  availability(): Promise<{
    available: boolean;
    reason?: string;
    version?: string;
    provider?: RouteProvider;
    mapsVersion?: string;
    tokenConfigured?: boolean;
    initialized?: boolean;
  }>;
  calculateRoute?(
    origin: { latitude: number; longitude: number },
    waypoints: Waypoint[],
  ): Promise<unknown>;
  start(
    session: string,
    waypoints: Waypoint[],
    routeID?: string,
  ): Promise<boolean>;
  update(waypoints: Waypoint[], routeID?: string): Promise<boolean>;
  continueTrip(): Promise<boolean>;
  stop(): Promise<void>;
  simulate(enabled: boolean): Promise<void>;
  licenses(): Promise<string>;
  addListener(
    name: "onNavigationEvent",
    listener: (event: unknown) => void,
  ): { remove(): void };
}
