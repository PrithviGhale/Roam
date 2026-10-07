export type VoiceEvent =
  | "Wake initializing"
  | "Wake armed"
  | "Wake detected"
  | "Wake released"
  | "Recognition preparing"
  | "Recognition started"
  | "Recognition stopped"
  | "Transcript received"
  | "Empty command"
  | "Command canceled"
  | "Assistant request"
  | "Searching"
  | "Speaking"
  | "TTS stopped"
  | "Cooldown"
  | "Voice error"
  | "Foreground"
  | "Background";
export class VoiceEventLog {
  private entries: { timestamp: number; event: VoiceEvent }[] = [];
  constructor(private now = Date.now) {}
  add(event: VoiceEvent) {
    this.entries.push({ timestamp: this.now(), event });
    this.entries = this.entries.slice(-80);
  }
  snapshot() {
    return this.entries.map((entry) => ({ ...entry }));
  }
}
