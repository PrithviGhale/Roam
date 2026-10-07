import { speedInMph, type SpeedReading } from "./location";
// Three fixes maximum; no path history. Reject bad measurements before smoothing.
export class SpeedFilter {
  private samples: number[] = [];
  private timestamp = -Infinity;
  private value: number | null = null;
  private stationary = 0;
  reset() {
    this.samples = [];
    this.value = null;
    this.stationary = 0;
    this.timestamp = -Infinity;
  }
  update(reading: SpeedReading, now = Date.now()): number | null {
    const speed = speedInMph(reading, now);
    if (speed === null) {
      this.reset();
      return null;
    }
    if (reading.timestamp <= this.timestamp)
      return this.value === null ? null : Math.round(this.value);
    if (reading.timestamp - this.timestamp > 8000) {
      this.samples = [];
      this.value = null;
      this.stationary = 0;
    }
    this.timestamp = reading.timestamp;
    this.stationary = reading.speed! < 0.8 ? this.stationary + 1 : 0;
    this.samples.push(reading.speed! * 2.236936);
    this.samples = this.samples.slice(-3);
    const sorted = [...this.samples].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)]!;
    this.value =
      this.stationary >= 2
        ? 0
        : this.value === null
          ? median
          : this.value * 0.35 + median * 0.65;
    return Math.max(0, Math.round(this.value));
  }
}
export class HeadingFilter {
  private value: number | null = null;
  private timestamp = -Infinity;
  reset() {
    this.value = null;
    this.timestamp = -Infinity;
  }
  current(now = Date.now()) {
    return now - this.timestamp <= 10000 ? this.value : null;
  }
  update(
    heading: number | null,
    speed: number | null,
    accuracy: number | null,
    timestamp: number,
    now = Date.now(),
  ) {
    if (
      !Number.isFinite(timestamp) ||
      now - timestamp > 15000 ||
      timestamp > now + 1000 ||
      accuracy === null ||
      !Number.isFinite(accuracy) ||
      accuracy < 0 ||
      accuracy > 25
    ) {
      this.reset();
      return null;
    }
    if (
      speed !== null &&
      Number.isFinite(speed) &&
      speed >= 2 &&
      speed <= 90 &&
      heading !== null &&
      Number.isFinite(heading) &&
      heading >= 0 &&
      heading < 360
    ) {
      this.value = heading;
      this.timestamp = timestamp;
    }
    // Hold the last moving GPS bearing briefly, rather than spin a stationary compass.
    if (now - this.timestamp > 10000) this.value = null;
    return this.value;
  }
}
