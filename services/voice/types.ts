export type VoicePhase =
  | "inactive"
  | "armed"
  | "wakeDetected"
  | "listening"
  | "transcribing"
  | "thinking"
  | "usingTool"
  | "speaking"
  | "cooldown"
  | "error";
export interface VoiceSettings {
  heyRoam: boolean;
  autoSpeak: boolean;
  shortReplies: boolean;
  volume: "system" | "softer";
}
export const defaultVoiceSettings: VoiceSettings = {
  heyRoam: false,
  autoSpeak: true,
  shortReplies: true,
  volume: "system",
};
export type WakeAvailability = "development-build" | "setup-required" | "ready";
export interface VoiceSnapshot {
  phase: VoicePhase;
  transcript: string;
  notice: string | null;
  followUp: boolean;
  wakeActive: boolean;
}
export interface CaptureEvents {
  active(): boolean;
  result(text: string, final: boolean): void;
  end(): void;
  error(): void;
}
export interface VoicePorts {
  wake: {
    availability(): WakeAvailability;
    start(
      detected: () => void,
      error: () => void,
      active?: () => boolean,
    ): Promise<void>;
    stop(): Promise<void>;
    dispose(): Promise<void>;
    supportsBargeIn: boolean;
  };
  speech: {
    available: boolean;
    start(events: CaptureEvents): Promise<void>;
    stop(): Promise<void>;
  };
  tts: {
    speak(
      text: string,
      volume: number,
      done: () => void,
      error: () => void,
    ): void;
    stop(): Promise<void>;
  };
  assistant(
    text: string,
    signal: AbortSignal,
    state: (phase: "thinking" | "usingTool") => void,
  ): Promise<{
    spokenText: string;
    text: string;
    error?: boolean;
    confirmation?: boolean;
  }>;
  clearConfirmation(): void;
  acknowledge(): void;
}
export function conversationCancelled(text: string) {
  return /^(never\s*mind|cancel|stop listening)[.!?]*$/i.test(text.trim());
}
export function wakeRequirement(availability: WakeAvailability) {
  return availability === "development-build"
    ? "Voice activation requires the ROAM development build."
    : availability === "setup-required"
      ? "Hey ROAM needs its device setup. Push-to-talk is still available."
      : null;
}
