export type WakeState =
  | "unavailable"
  | "initializing"
  | "armed"
  | "wakeDetected"
  | "pausedForRecognition"
  | "error";
export type WakeFailure =
  | "missing-model"
  | "missing-key"
  | "invalid-key"
  | "permission"
  | "initialization";
export class VoiceSetupError extends Error {
  constructor(
    public readonly reason: WakeFailure,
    message: string,
  ) {
    super(message);
  }
}
export interface WakeManager {
  start(): Promise<void>;
  stop(): Promise<void>;
  delete(): void;
}
export interface WakeDependencies {
  available(): boolean;
  modelExists(): boolean;
  readKey(): Promise<string | null>;
  permission(): Promise<boolean>;
  create(
    key: string,
    sensitivity: number,
    detected: () => void,
    error: () => void,
  ): Promise<WakeManager>;
  recoverStart(): Promise<void>;
}
// One instance per app session. Secrets never enter its public snapshot or event log.
export class WakeRuntime {
  private manager: WakeManager | null = null;
  private pending: Promise<void> | null = null;
  private epoch = 0;
  private state: WakeState = "unavailable";
  private found: boolean | null = null;
  private configured: boolean | null = null;
  private failure: WakeFailure | null = null;
  private sensitivity = 0.5;
  private detected: () => void = () => {};
  private error: () => void = () => {};
  private active: () => boolean = () => false;
  constructor(private dependencies: WakeDependencies) {}
  diagnostics() {
    return {
      state: this.state,
      initialized: !!this.manager,
      modelFound: this.found,
      accessKeyConfigured: this.configured,
      failure: this.failure,
      sensitivity: this.sensitivity,
    };
  }
  async inspect() {
    if (!this.dependencies.available()) return this.diagnostics();
    this.found = this.dependencies.modelExists();
    this.configured = !!(await this.dependencies.readKey());
    return this.diagnostics();
  }
  setSensitivity(value: number) {
    if (this.manager || this.pending)
      throw new Error("Release wake audio before changing sensitivity.");
    if (!Number.isFinite(value) || value < 0.2 || value > 0.8)
      throw new Error("Sensitivity must be between 0.2 and 0.8.");
    this.sensitivity = value;
  }
  start(
    detected: () => void,
    error: () => void,
    active = () => true,
  ): Promise<void> {
    if (this.pending) return this.pending;
    if (this.state === "armed") return Promise.resolve();
    const epoch = this.epoch;
    this.detected = detected;
    this.error = error;
    this.active = () => active() && epoch === this.epoch;
    this.pending = this.begin(
      detected,
      error,
      () => active() && epoch === this.epoch,
    ).finally(() => {
      this.pending = null;
    });
    return this.pending;
  }
  private async begin(
    detected: () => void,
    error: () => void,
    active: () => boolean,
  ) {
    this.failure = null;
    try {
      if (!this.dependencies.available()) {
        this.state = "unavailable";
        throw new VoiceSetupError(
          "initialization",
          "Voice activation requires the ROAM development build.",
        );
      }
      this.state = "initializing";
      this.found = this.dependencies.modelExists();
      if (!this.found)
        throw new VoiceSetupError(
          "missing-model",
          "Hey ROAM model is not configured.",
        );
      const key = await this.dependencies.readKey();
      this.configured = !!key;
      if (!key)
        throw new VoiceSetupError(
          "missing-key",
          "Hey ROAM AccessKey is not configured. Push-to-talk and text are available.",
        );
      if (!active()) return;
      if (!(await this.dependencies.permission()))
        throw new VoiceSetupError(
          "permission",
          "Allow microphone access in iPhone Settings for Hey ROAM. Text remains available.",
        );
      if (!active()) return;
      if (!this.manager)
        this.manager = await this.dependencies.create(
          key,
          this.sensitivity,
          () => {
            if (this.state !== "armed" || !this.active()) return;
            this.state = "wakeDetected";
            this.detected();
          },
          () => {
            if (!this.active()) return;
            this.state = "error";
            this.error();
          },
        );
      if (!active()) {
        await this.destroy();
        return;
      }
      try {
        await this.manager.start();
      } catch (failure) {
        await this.dependencies.recoverStart();
        throw failure;
      }
      if (!active()) {
        await this.destroy();
        return;
      }
      this.state = "armed";
    } catch (failure) {
      await this.destroy();
      const reason =
        failure instanceof VoiceSetupError
          ? failure.reason
          : /activation|accesskey|license/i.test(
                failure instanceof Error ? failure.name : "",
              )
            ? "invalid-key"
            : "initialization";
      this.failure = reason;
      this.state = "error";
      throw failure instanceof VoiceSetupError
        ? failure
        : new VoiceSetupError(
            reason,
            reason === "invalid-key"
              ? "Hey ROAM could not authorize its AccessKey. Check device setup; push-to-talk and text remain available."
              : "Hey ROAM initialization failed. Check device setup; push-to-talk and text remain available.",
          );
    } finally {
      if (this.state === "initializing") this.state = "unavailable";
    }
  }
  async stop() {
    await this.manager?.stop();
    if (this.state !== "error")
      this.state = this.manager ? "pausedForRecognition" : "unavailable";
  }
  private async destroy() {
    const manager = this.manager;
    if (!manager) return;
    await manager.stop();
    manager.delete();
    this.manager = null;
  }
  async dispose() {
    this.epoch++;
    // Initialization must settle before deletion, including a delayed native create.
    await this.pending?.catch(() => {});
    await this.destroy();
    if (this.state !== "error") this.state = "unavailable";
  }
}
