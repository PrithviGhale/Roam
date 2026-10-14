export const launchDuration = (reduced: boolean) => reduced ? 220 : 1380;
export class LaunchSession {
  private shown = false;
  claim(): "cold" | "warm" { if (this.shown) return "warm"; this.shown = true; return "cold"; }
}
export const launchSession = new LaunchSession();
