import type { Route } from "../types/domain";
import { projectOntoRoute, type RouteProjection } from "../utils/geo";
import { validCoordinate } from "../utils/location";
import type { TrackingFix } from "./routeTracking";
export class ProgressTracker {
  private route: Route | null = null;
  private accepted: RouteProjection | null = null;
  private timestamp = -Infinity;
  reset() {
    this.route = null;
    this.accepted = null;
    this.timestamp = -Infinity;
  }
  observe(route: Route, fix: TrackingFix, now: number): RouteProjection | null {
    if (route !== this.route) {
      this.reset();
      this.route = route;
    }
    if (
      !fix.fresh ||
      !validCoordinate(fix.coordinate) ||
      !Number.isFinite(fix.timestamp) ||
      now - fix.timestamp > 15000 ||
      fix.timestamp > now + 1000 ||
      fix.accuracy === null ||
      !Number.isFinite(fix.accuracy) ||
      fix.accuracy < 0 ||
      fix.accuracy > 50
    )
      return null;
    if (fix.timestamp <= this.timestamp) return this.accepted;
    const elapsed = Math.max(0, (fix.timestamp - this.timestamp) / 1000);
    // A long gap needs a new anchor. It must still be accurate and on the route.
    const anchor = elapsed <= 30 ? this.accepted : null;
    const projection = projectOntoRoute(
      fix.coordinate,
      route.geometry,
      anchor
        ? {
            progressMeters: anchor.progressMeters,
            backwardMeters: 40,
            forwardMeters: Math.max(100, elapsed * 55),
          }
        : undefined,
    );
    if (!projection || projection.offsetMeters > Math.max(70, fix.accuracy * 3))
      return null;
    this.timestamp = fix.timestamp;
    // Ignore small backward jitter; route revisions reset this monotonic anchor.
    this.accepted =
      anchor && projection.progressMeters < anchor.progressMeters
        ? { ...projection, progressMeters: anchor.progressMeters }
        : projection;
    return this.accepted;
  }
}
