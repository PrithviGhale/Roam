import { mapPreference, type MapPreference } from "./themes";
export interface PreferenceStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}
export class MapPreferences {
  private value: MapPreference = "automatic";
  private touched = false;
  private hydrated = false;
  private reading: Promise<void> | null = null;
  private writes: Promise<void> = Promise.resolve();
  private listeners = new Set<() => void>();
  constructor(private storage: PreferenceStorage) {}
  getSnapshot = () => this.value;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  hydrate = () => {
    if (this.reading) return this.reading;
    this.reading = this.storage
      .getItem("roam.map-theme")
      .then((stored) => {
        if (!this.touched) {
          this.value = mapPreference(stored);
          this.listeners.forEach((listener) => listener());
        }
      })
      .catch(() => {})
      .finally(() => {
        this.hydrated = true;
        if (this.touched) this.persist();
      });
    return this.reading;
  };
  set = (value: MapPreference) => {
    this.touched = true;
    this.value = mapPreference(value);
    this.listeners.forEach((listener) => listener());
    if (this.hydrated) this.persist();
  };
  private persist() {
    const value = this.value;
    this.writes = this.writes
      .catch(() => {})
      .then(() => this.storage.setItem("roam.map-theme", value))
      .catch(() => {});
  }
  flush = () => this.writes;
}
