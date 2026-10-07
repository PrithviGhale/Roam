import { drivingDistance, type NavigationState } from "./NavigationController";
export const speechPriority = {
  STATUS: 0,
  ASSISTANT: 1,
  ASSISTANT_CONFIRMATION: 2,
  NAVIGATION: 3,
  CRITICAL_NAVIGATION: 4,
} as const;
// One prompt at each useful distance band; no queue of obsolete directions.
export class GuidanceSpeech {
  private step = "";
  private bands = new Set<number>();
  private voiceSequence = -1;
  next(
    state: NavigationState,
    now = Date.now(),
  ): { text: string; priority: number } | null {
    if (state.provider === "mapbox") {
      const v = state.voice;
      if (
        state.mode !== "native" ||
        state.rerouting ||
        state.waypointId ||
        !v ||
        now - v.timestamp > 5000 ||
        v.sequence <= this.voiceSequence
      )
        return null;
      this.voiceSequence = v.sequence;
      return {
        text: v.text,
        priority: v.critical
          ? speechPriority.CRITICAL_NAVIGATION
          : speechPriority.NAVIGATION,
      };
    }
    const g = state.guidance;
    if (
      state.mode !== "native" ||
      !g ||
      state.rerouting ||
      state.waypointId ||
      state.updatedAt === null ||
      now - state.updatedAt > 15000
    )
      return null;
    const key = `${state.session}:${g.step}:${g.instruction}`;
    if (key !== this.step) {
      this.step = key;
      this.bands.clear();
    }
    const distance = g.distanceToManeuverMeters;
    const band =
      distance <= 60 ? 0 : distance <= 300 ? 1 : distance <= 1000 ? 2 : 3;
    if (band === 3 || this.bands.has(band)) return null;
    this.bands.add(band);
    return {
      text:
        band === 0
          ? g.instruction
          : `In ${drivingDistance(distance)}, ${g.instruction}`,
      priority:
        band === 0
          ? speechPriority.CRITICAL_NAVIGATION
          : speechPriority.NAVIGATION,
    };
  }
  reset() {
    this.voiceSequence = -1;
    this.step = "";
    this.bands.clear();
  }
}
