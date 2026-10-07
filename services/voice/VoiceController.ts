import {
  conversationCancelled,
  defaultVoiceSettings,
  wakeRequirement,
  type VoicePorts,
  type VoiceSettings,
  type VoiceSnapshot,
} from "./types";

// Only short audio transitions are serialized. Network and playback callbacks never hold
// this queue, so backgrounding/cancellation can always release the microphone.
export class VoiceController {
  snapshot: VoiceSnapshot = {
    phase: "inactive",
    transcript: "",
    notice: null,
    followUp: false,
    wakeActive: false,
  };
  settings = { ...defaultVoiceSettings };
  private foreground = true;
  private trip: string | null = null;
  private suspended = false;
  private audioLeases = new Set<string>();
  private disposed = false;
  private version = 0;
  private queue: Promise<void> = Promise.resolve();
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private request: AbortController | null = null;
  private lastWake = -Infinity;
  private capture = false;
  private finalText = "";
  private armedSince: number | null = null;
  private metrics = { wakeActiveMs: 0, activations: 0, speechSessions: 0 };
  constructor(
    private ports: VoicePorts,
    private now = Date.now,
  ) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.snapshot;
  diagnostics() {
    return {
      ...this.metrics,
      wakeActiveMs:
        this.metrics.wakeActiveMs +
        (this.armedSince === null ? 0 : this.now() - this.armedSince),
      bargeIn: this.ports.wake.supportsBargeIn,
    };
  }
  private update(next: Partial<VoiceSnapshot>) {
    this.snapshot = { ...this.snapshot, ...next };
    this.listeners.forEach((fn) => fn());
  }
  private enqueue(task: () => Promise<void>) {
    const next = this.queue.then(task);
    this.queue = next.catch(() => {
      this.version++;
      this.capture = false;
      this.clearTimer();
      this.request?.abort();
      this.update({
        phase: "error",
        notice:
          "Voice needs attention. Check setup or permissions, then retry. If the microphone stays active, close ROAM.",
      });
    });
    return this.queue;
  }
  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }
  private valid(version: number) {
    return (
      !this.disposed &&
      !this.suspended &&
      this.foreground &&
      version === this.version
    );
  }
  private eligible() {
    return (
      this.settings.heyRoam &&
      !!this.trip &&
      this.foreground &&
      !this.suspended &&
      !this.disposed
    );
  }
  private async stopWake() {
    await this.ports.wake.stop();
    if (this.armedSince !== null)
      this.metrics.wakeActiveMs += Math.max(0, this.now() - this.armedSince);
    this.armedSince = null;
    this.update({ wakeActive: false });
  }
  private async release() {
    this.clearTimer();
    this.capture = false;
    this.finalText = "";
    // Attempt every release even when one native consumer fails. Never start another
    // consumer if stop throws: the queue enters an explicit retryable error state.
    const results = await Promise.allSettled([
      this.stopWake(),
      this.ports.speech.stop(),
      this.ports.tts.stop(),
    ]);
    const failed = results.find((result) => result.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
    this.update({ transcript: "", followUp: false });
  }
  private async arm(version: number) {
    if (!this.valid(version) || !this.eligible()) {
      this.update({ phase: "inactive" });
      return;
    }
    const notice = wakeRequirement(this.ports.wake.availability());
    if (notice) {
      this.update({ phase: "inactive", notice });
      return;
    }
    await this.ports.wake.start(
      () => this.detected(),
      () => this.interrupted(),
      () => this.valid(version) && this.eligible(),
    );
    if (!this.valid(version) || !this.eligible()) {
      await this.stopWake();
      return;
    }
    this.armedSince = this.now();
    this.update({ wakeActive: true });
    this.update({ phase: "armed", notice: null });
  }
  configure(settings: VoiceSettings, foreground: boolean, trip: string | null) {
    const lifecycleChanged =
      foreground !== this.foreground ||
      trip !== this.trip ||
      settings.heyRoam !== this.settings.heyRoam;
    this.settings = { ...settings };
    this.foreground = foreground;
    this.trip = trip;
    if (lifecycleChanged) void this.cancel(false);
  }
  refreshAvailability() {
    return this.cancel(false);
  }
  async suspend(value: boolean, owner = "external") {
    if (value) this.audioLeases.add(owner);
    else this.audioLeases.delete(owner);
    this.suspended = this.audioLeases.size > 0;
    await this.cancel(false);
    return this.snapshot.phase !== "error";
  }
  cancel(clearConfirmation = true) {
    const version = ++this.version;
    this.request?.abort();
    this.request = null;
    this.capture = false;
    this.clearTimer();
    if (clearConfirmation) this.ports.clearConfirmation();
    return this.enqueue(async () => {
      await this.release();
      if (version !== this.version) return;
      this.update({ phase: "inactive", notice: null });
      await this.arm(version);
    });
  }
  interrupted() {
    const version = ++this.version;
    this.request?.abort();
    this.capture = false;
    this.clearTimer();
    this.ports.clearConfirmation();
    void this.enqueue(async () => {
      await this.release();
      if (version === this.version)
        this.update({
          phase: "error",
          notice:
            "Audio was interrupted. Tap to try again when it is available.",
        });
    });
    // Do not immediately restart and fight a phone call. Foreground return or a
    // deliberate retry can re-arm after the operating system releases audio.
  }
  detected() {
    if (
      !this.eligible() ||
      (this.snapshot.phase !== "armed" &&
        !(
          this.snapshot.phase === "speaking" && this.ports.wake.supportsBargeIn
        )) ||
      this.now() - this.lastWake < 1800
    )
      return;
    this.lastWake = this.now();
    this.metrics.activations++;
    this.update({ phase: "wakeDetected" });
    this.ports.acknowledge();
    void this.listen(false);
  }
  listen(followUp = false) {
    if (this.disposed || this.suspended || !this.foreground)
      return Promise.resolve();
    if (
      this.snapshot.phase === "thinking" ||
      this.snapshot.phase === "usingTool"
    )
      return Promise.resolve();
    const version = ++this.version;
    this.request?.abort();
    this.capture = false;
    return this.enqueue(async () => {
      await this.release();
      if (!this.valid(version)) return;
      if (!this.ports.speech.available) {
        this.update({
          phase: "inactive",
          notice:
            "Voice activation requires the ROAM development build. You can type or listen to replies here.",
        });
        return;
      }
      this.finalText = "";
      this.capture = true;
      this.update({ phase: "listening", followUp, notice: null });
      await this.ports.speech.start({
        active: () => this.valid(version) && this.capture,
        result: (text, final) => {
          if (!this.valid(version) || !this.capture) return;
          this.update({ transcript: text });
          if (final) {
            this.finalText = text.trim();
            this.update({ phase: "transcribing" });
          }
        },
        end: () => {
          if (!this.valid(version) || !this.capture) return;
          const text = this.finalText;
          this.capture = false;
          this.clearTimer();
          void this.finishCapture(text, version);
        },
        error: () => {
          if (this.valid(version) && this.capture) this.interrupted();
        },
      });
      this.metrics.speechSessions++;
      if (!this.valid(version)) {
        this.capture = false;
        await this.ports.speech.stop();
        return;
      }
      this.timer = setTimeout(
        () => {
          if (this.valid(version) && this.capture) {
            this.capture = false;
            const text = this.finalText;
            void this.finishCapture(text, version);
          }
        },
        followUp ? 10000 : 12000,
      );
    });
  }
  private async finishCapture(text: string, version: number) {
    await this.enqueue(async () => {
      await this.ports.speech.stop();
      this.update({ transcript: "", followUp: false });
    });
    if (!this.valid(version)) return;
    if (!text) {
      this.ports.clearConfirmation();
      await this.cooldown(
        version,
        "I didn’t catch that. Say Hey ROAM again or tap to speak.",
      );
      return;
    }
    await this.send(text, true);
  }
  async send(input: string, fromVoice = false) {
    const text = input.trim().slice(0, 1000);
    if (
      !text ||
      this.disposed ||
      this.suspended ||
      !this.foreground ||
      this.snapshot.phase === "thinking" ||
      this.snapshot.phase === "usingTool"
    )
      return;
    if (conversationCancelled(text)) {
      await this.cancel();
      return;
    }
    const version = ++this.version;
    await this.enqueue(async () => {
      await this.release();
      if (this.valid(version)) this.update({ phase: "thinking", notice: null });
    });
    if (!this.valid(version) || this.snapshot.phase === "error") return;
    const request = new AbortController();
    this.request = request;
    try {
      const reply = await this.ports.assistant(
        text,
        request.signal,
        (phase) => {
          if (this.valid(version)) this.update({ phase });
        },
      );
      if (!this.valid(version) || request.signal.aborted) return;
      this.request = null;
      const follow = Boolean(
        fromVoice && reply.confirmation && !reply.error && this.eligible(),
      );
      if (this.settings.autoSpeak && (fromVoice || this.trip))
        this.play(
          reply.error
            ? "ROAM couldn’t complete that request. Please try again."
            : this.settings.shortReplies && this.trip
              ? reply.spokenText
              : reply.text,
          version,
          follow,
        );
      else if (follow) {
        this.update({ phase: "inactive" });
        await this.listen(true);
      } else
        await this.cooldown(
          version,
          reply.error
            ? "ROAM couldn’t complete that request. Try again."
            : null,
        );
    } catch {
      if (this.valid(version) && !request.signal.aborted)
        await this.cooldown(
          version,
          "ROAM couldn’t reach the service. Try again.",
        );
    }
  }
  private play(text: string, version: number, followUp: boolean) {
    this.update({ phase: "speaking" });
    const finished = () => {
      if (!this.valid(version)) return;
      this.clearTimer();
      void this.enqueue(async () => {
        await this.stopWake();
        await this.ports.tts.stop();
      }).then(async () => {
        if (!this.valid(version)) return;
        this.update({ phase: "inactive" });
        if (followUp) await this.listen(true);
        else await this.cooldown(version);
      });
    };
    this.timer = setTimeout(() => this.interrupted(), 45000);
    this.ports.tts.speak(
      text.slice(0, 1200),
      this.settings.volume === "softer" ? 0.65 : 1,
      finished,
      () => this.interrupted(),
    );
    if (this.ports.wake.supportsBargeIn && this.eligible())
      void this.enqueue(async () => {
        if (this.valid(version)) {
          await this.ports.wake.start(
            () => this.detected(),
            () => this.interrupted(),
          );
          this.armedSince = this.now();
          this.update({ wakeActive: true });
          if (!this.valid(version)) await this.stopWake();
        }
      });
  }
  async speak(text: string) {
    if (["thinking", "usingTool"].includes(this.snapshot.phase)) return;
    const version = ++this.version;
    await this.enqueue(async () => {
      await this.release();
      if (this.valid(version)) this.play(text, version, false);
    });
  }
  private cooldown(version: number, notice: string | null = null) {
    if (!this.valid(version)) return Promise.resolve();
    this.update({ phase: "cooldown", notice });
    this.clearTimer();
    this.timer = setTimeout(() => {
      void this.enqueue(() => this.arm(version));
    }, 1200);
    return Promise.resolve();
  }
  async dispose() {
    this.disposed = true;
    await this.cancel();
    await this.enqueue(() => this.ports.wake.dispose());
    this.listeners.clear();
  }
}
