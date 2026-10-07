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
export const coordinateSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
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
] as const;
export const eventSchema = z.object({
  session: z.string(),
  sequence: z.number().int().nonnegative(),
  timestamp: z.number().finite(),
  kind: z.enum(eventKinds),
  guidance: guidanceSchema.optional(),
  geometry: z.array(coordinateSchema).max(50000).optional(),
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
  }>;
  start(session: string, waypoints: Waypoint[]): Promise<boolean>;
  update(waypoints: Waypoint[]): Promise<boolean>;
  continueTrip(): Promise<boolean>;
  stop(): Promise<void>;
  simulate(enabled: boolean): Promise<void>;
  licenses(): Promise<string>;
  addListener(
    name: "onNavigationEvent",
    listener: (event: unknown) => void,
  ): { remove(): void };
}
