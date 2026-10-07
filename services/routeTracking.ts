import type { Coordinate, Route } from "../types/domain";
import { projectOntoRoute } from "../utils/geo";
import { LIMITS } from "../shared/limits";
import { validCoordinate } from "../utils/location";
export interface TrackingFix {
  coordinate: Coordinate;
  accuracy: number | null;
  timestamp: number;
  fresh: boolean;
}
// No point history: only a confirmation count/timestamps and the current route identity.
export class RouteDeviationMonitor {
  private route: Route | null = null;
  private count = 0;
  private first = 0;
  private last = 0;
  private attemptedAt = -Infinity;
  constructor(private cooldown = LIMITS.REROUTE_COOLDOWN_MS) {}
  reset() {
    this.route = null;
    this.count = 0;
    this.first = this.last = 0;
    this.attemptedAt = -Infinity;
  }
  observe(route: Route, fix: TrackingFix, now = Date.now()) {
    if (this.route !== route) {
      this.route = route;
      this.count = 0;
      this.first = this.last = 0;
    }
    const invalid =
      !fix.fresh ||
      !validCoordinate(fix.coordinate) ||
      !Number.isFinite(fix.timestamp) ||
      fix.accuracy === null ||
      !Number.isFinite(fix.accuracy) ||
      fix.accuracy < 0 ||
      fix.accuracy > LIMITS.MAX_GPS_ACCURACY_METERS ||
      now - fix.timestamp > 15_000 ||
      fix.timestamp > now + 1000;
    if (invalid) {
      this.count = 0;
      return { state: "onRoute" as const, reroute: false };
    }
    if (fix.timestamp <= this.last)
      return {
        state: this.count
          ? ("possiblyOffRoute" as const)
          : ("onRoute" as const),
        reroute: false,
      };
    const projection = projectOntoRoute(fix.coordinate, route.geometry);
    if (!projection) return { state: "onRoute" as const, reroute: false };
    if (fix.timestamp - this.last > 15_000) this.count = 0;
    this.last = fix.timestamp;
    const threshold = Math.max(70, fix.accuracy! * 3);
    if (projection.offsetMeters <= threshold) {
      this.count = 0;
      return { state: "onRoute" as const, reroute: false };
    }
    if (!this.count) this.first = fix.timestamp;
    this.count++;
    const confirmed =
      this.count >= LIMITS.OFF_ROUTE_CONFIRMATIONS &&
      fix.timestamp - this.first >= LIMITS.OFF_ROUTE_CONFIRM_MS;
    const reroute = confirmed && now - this.attemptedAt >= this.cooldown;
    if (reroute) {
      this.attemptedAt = now;
      this.count = 0;
    }
    return { state: "possiblyOffRoute" as const, reroute };
  }
  markAttempt(now = Date.now()) {
    this.attemptedAt = now;
    this.count = 0;
  }
}
