import { test } from "node:test";
import assert from "node:assert/strict";
import { VoiceController } from "../services/voice/VoiceController";
import {
  defaultVoiceSettings,
  conversationCancelled,
  wakeRequirement,
  type CaptureEvents,
  type VoicePorts,
  type WakeAvailability,
} from "../services/voice/types";
const flush = async () => {
  for (let step = 0; step < 40; step++) await Promise.resolve();
};
function harness(availability: WakeAvailability = "ready") {
  let microphone: "wake" | "speech" | null = null,
    speaking = false;
  let capture: CaptureEvents | undefined,
    detection: (() => void) | undefined,
    done: (() => void) | undefined;
  let confirmation = false,
    clears = 0;
  const requests: string[] = [],
    events: string[] = [];
  const ports: VoicePorts = {
    wake: {
      supportsBargeIn: false,
      availability: () => availability,
      async start(detected) {
        assert.equal(microphone, null);
        assert.equal(speaking, false);
        microphone = "wake";
        detection = detected;
        events.push("wake-start");
      },
      async stop() {
        if (microphone === "wake") microphone = null;
        events.push("wake-stop");
      },
      async dispose() {
        events.push("disposed");
      },
    },
    speech: {
      available: true,
      async start(next) {
        assert.equal(microphone, null);
        assert.equal(speaking, false);
        microphone = "speech";
        capture = next;
        events.push("speech-start");
      },
      async stop() {
        if (microphone === "speech") microphone = null;
        events.push("speech-stop");
      },
    },
    tts: {
      speak(_text, _volume, finished) {
        assert.equal(microphone, null);
        speaking = true;
        done = finished;
        events.push("tts-start");
      },
      async stop() {
        speaking = false;
        events.push("tts-stop");
      },
    },
    async assistant(text, signal) {
      assert.equal(microphone, null);
      assert.equal(speaking, false);
      assert.equal(signal.aborted, false);
      requests.push(text);
      return { text: "A longer response.", spokenText: "Done.", confirmation };
    },
    clearConfirmation() {
      clears++;
      confirmation = false;
    },
    acknowledge() {
      events.push("haptic");
    },
  };
  const controller = new VoiceController(ports);
  return {
    controller,
    ports,
    requests,
    events,
    get microphone() {
      return microphone;
    },
    get speaking() {
      return speaking;
    },
    get clears() {
      return clears;
    },
    get capture() {
      return capture!;
    },
    detect() {
      detection!();
    },
    finishSpeaking() {
      speaking = false;
      done!();
    },
    confirmation(value: boolean) {
      confirmation = value;
    },
    async arm() {
      controller.configure(
        { ...defaultVoiceSettings, heyRoam: true },
        true,
        "trip-1",
      );
      await flush();
    },
    async utterance(text: string, final = true) {
      capture!.result(text, final);
      capture!.end();
      await flush();
    },
  };
}
test("wake is off by default and needs a foreground active trip", async () => {
  const h = harness();
  h.controller.configure(defaultVoiceSettings, true, "trip");
  await flush();
  assert.equal(h.microphone, null);
  h.controller.configure(
    { ...defaultVoiceSettings, heyRoam: true },
    true,
    null,
  );
  await flush();
  assert.equal(h.microphone, null);
  await h.arm();
  assert.equal(h.controller.snapshot.phase, "armed");
  assert.equal(h.microphone, "wake");
  await h.controller.dispose();
});
test("wake detection pauses local detector before finite command capture", async () => {
  const h = harness();
  await h.arm();
  h.detect();
  await flush();
  assert.equal(h.microphone, "speech");
  assert.equal(h.controller.snapshot.phase, "listening");
  assert.equal(h.controller.diagnostics().activations, 1);
  assert.equal(h.controller.diagnostics().speechSessions, 1);
  await h.controller.dispose();
});
test("a final utterance releases microphone before assistant and TTS", async () => {
  const h = harness();
  await h.arm();
  h.detect();
  await flush();
  await h.utterance("Find coffee");
  assert.deepEqual(h.requests, ["Find coffee"]);
  assert.equal(h.controller.snapshot.phase, "speaking");
  assert.equal(h.microphone, null);
  await h.controller.dispose();
});
test("interim text is never submitted on silence or end", async () => {
  const h = harness();
  await h.controller.listen();
  await h.utterance("Cancel my rou", false);
  assert.deepEqual(h.requests, []);
  assert.equal(h.controller.snapshot.phase, "cooldown");
  await h.controller.dispose();
});
test("verified confirmation opens ten-second follow-up after playback", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 10000 });
  const h = harness();
  await h.arm();
  h.confirmation(true);
  h.detect();
  await flush();
  await h.utterance("Find food");
  assert.equal(h.controller.snapshot.followUp, false);
  h.finishSpeaking();
  await flush();
  assert.equal(h.controller.snapshot.followUp, true);
  assert.equal(h.microphone, "speech");
  await h.utterance("Yes");
  assert.deepEqual(h.requests, ["Find food", "Yes"]);
  await h.controller.dispose();
});
test("follow-up timeout clears confirmation and returns to local wake", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 10000 });
  const h = harness();
  await h.arm();
  h.confirmation(true);
  h.detect();
  await flush();
  await h.utterance("Find food");
  h.finishSpeaking();
  await flush();
  context.mock.timers.tick(10000);
  await flush();
  assert.equal(h.controller.snapshot.followUp, false);
  assert.equal(h.requests.length, 1);
  assert.ok(h.clears > 0);
  context.mock.timers.tick(1200);
  await flush();
  assert.equal(h.microphone, "wake");
  await h.controller.dispose();
});
test("ordinary assistant text does not invent a confirmation window", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 10000 });
  const h = harness();
  await h.arm();
  h.detect();
  await flush();
  await h.utterance("ETA");
  h.finishSpeaking();
  await flush();
  assert.equal(h.controller.snapshot.phase, "cooldown");
  assert.equal(h.controller.snapshot.followUp, false);
  context.mock.timers.tick(1200);
  await flush();
  assert.equal(h.microphone, "wake");
  await h.controller.dispose();
});
test("rapid wake repetitions cannot create simultaneous commands", async () => {
  const h = harness();
  await h.arm();
  h.detect();
  h.detect();
  h.detect();
  await flush();
  assert.equal(h.controller.diagnostics().activations, 1);
  assert.equal(h.controller.diagnostics().speechSessions, 1);
  await h.controller.dispose();
});
test("capture window expires after twelve seconds", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 10000 });
  const h = harness();
  await h.controller.listen();
  h.capture.result("unfinished", false);
  context.mock.timers.tick(12000);
  await flush();
  assert.equal(h.microphone, null);
  assert.deepEqual(h.requests, []);
  assert.equal(h.controller.snapshot.phase, "cooldown");
  await h.controller.dispose();
});
test("background discards even final text and stops every audio consumer", async () => {
  const h = harness();
  await h.arm();
  h.detect();
  await flush();
  h.capture.result("Add a stop", true);
  h.controller.configure(h.controller.settings, false, "trip-1");
  h.capture.end();
  await flush();
  assert.equal(h.microphone, null);
  assert.equal(h.speaking, false);
  assert.deepEqual(h.requests, []);
  assert.equal(h.controller.snapshot.phase, "inactive");
  await h.controller.dispose();
});
test("foreground return safely re-arms while ending a trip disarms", async () => {
  const h = harness();
  await h.arm();
  h.controller.configure(h.controller.settings, false, "trip-1");
  await flush();
  h.controller.configure(h.controller.settings, true, "trip-1");
  await flush();
  assert.equal(h.microphone, "wake");
  h.controller.configure(h.controller.settings, true, null);
  await flush();
  assert.equal(h.microphone, null);
  await h.controller.dispose();
});
test("voice disabled releases audio and push-to-talk still works", async () => {
  const h = harness();
  await h.arm();
  h.controller.configure(defaultVoiceSettings, true, "trip-1");
  await flush();
  assert.equal(h.microphone, null);
  await h.controller.listen();
  assert.equal(h.microphone, "speech");
  await h.controller.dispose();
});
test("missing native wake module has an honest fallback without microphone", async () => {
  const h = harness("development-build");
  h.ports.speech.available = false;
  await h.arm();
  assert.equal(h.microphone, null);
  assert.match(h.controller.snapshot.notice!, /development build/);
  await h.controller.listen();
  assert.match(h.controller.snapshot.notice!, /type/);
  await h.controller.send("ETA");
  assert.equal(h.requests.length, 1);
  await h.controller.dispose();
});
test("missing custom model keeps native push-to-talk available", async () => {
  const h = harness("setup-required");
  await h.arm();
  assert.equal(h.microphone, null);
  assert.match(h.controller.snapshot.notice!, /setup/);
  await h.controller.listen();
  assert.equal(h.microphone, "speech");
  await h.controller.dispose();
});
test("interruption discards text and waits for explicit retry rather than fighting OS", async () => {
  const h = harness();
  await h.arm();
  h.detect();
  await flush();
  h.capture.result("Add", false);
  h.capture.error();
  h.capture.end();
  await flush();
  assert.equal(h.microphone, null);
  assert.deepEqual(h.requests, []);
  assert.equal(h.controller.snapshot.phase, "error");
  await h.controller.listen();
  assert.equal(h.microphone, "speech");
  await h.controller.dispose();
});
test("conversation cancellation is distinct from explicit route cancellation", async () => {
  const h = harness();
  for (const phrase of [
    "Never mind",
    "Nevermind.",
    "Cancel",
    "Stop listening!",
  ]) {
    assert.equal(conversationCancelled(phrase), true);
    await h.controller.send(phrase);
  }
  assert.deepEqual(h.requests, []);
  assert.ok(h.clears >= 4);
  assert.equal(conversationCancelled("Cancel my route."), false);
  await h.controller.send("Cancel my route.");
  assert.deepEqual(h.requests, ["Cancel my route."]);
  await h.controller.dispose();
});
test("TTS pauses wake and explicit microphone interruption releases playback first", async () => {
  const h = harness();
  await h.arm();
  await h.controller.send("ETA", true);
  assert.equal(h.microphone, null);
  assert.equal(h.speaking, true);
  await h.controller.listen();
  assert.equal(h.speaking, false);
  assert.equal(h.microphone, "speech");
  await h.controller.dispose();
});
test("late assistant response after background cannot start playback", async () => {
  const h = harness();
  let resolve!: (reply: { text: string; spokenText: string }) => void;
  h.ports.assistant = () =>
    new Promise((done) => {
      resolve = done;
    });
  await h.arm();
  const request = h.controller.send("ETA", true);
  await flush();
  h.controller.configure(h.controller.settings, false, "trip-1");
  await flush();
  resolve({ text: "Late", spokenText: "Late" });
  await request;
  assert.equal(h.speaking, false);
  assert.equal(h.microphone, null);
  await h.controller.dispose();
});
test("pending permission/native start is invalidated on background", async () => {
  const h = harness();
  let complete!: () => void;
  h.ports.speech.start = (next) =>
    new Promise((resolve) => {
      complete = () => {
        assert.equal(next.active(), false);
        resolve();
      };
    });
  const listening = h.controller.listen();
  await flush();
  h.controller.configure(h.controller.settings, false, null);
  complete();
  await listening;
  await flush();
  assert.equal(h.controller.snapshot.phase, "inactive");
  assert.equal(h.microphone, null);
  await h.controller.dispose();
});
test("native stop failure prevents assistant submission and new consumer starts", async () => {
  const h = harness();
  await h.controller.listen();
  h.ports.speech.stop = async () => {
    throw new Error("Cannot release microphone");
  };
  await h.utterance("Add stop");
  assert.deepEqual(h.requests, []);
  assert.equal(h.controller.snapshot.phase, "error");
  h.ports.speech.stop = async () => {};
  await h.controller.dispose();
});
test("diagnostics suspend owns audio until focus is released", async () => {
  const h = harness();
  await h.arm();
  await h.controller.suspend(true);
  assert.equal(h.microphone, null);
  await h.controller.listen();
  assert.equal(h.microphone, null);
  await h.controller.suspend(false);
  assert.equal(h.microphone, "wake");
  await h.controller.dispose();
});
test("wake duration metrics are memory-only and exclude transcription/TTS", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 10000 });
  const h = harness();
  await h.arm();
  context.mock.timers.tick(4000);
  h.detect();
  await flush();
  context.mock.timers.tick(500);
  assert.equal(h.controller.diagnostics().wakeActiveMs, 4000);
  await h.controller.dispose();
  const other = harness();
  assert.equal(other.controller.diagnostics().activations, 0);
  await other.controller.dispose();
});
test("softer volume and full/short response preferences reach TTS", async () => {
  const h = harness();
  const spoken: [string, number][] = [];
  h.ports.tts.speak = (text, volume) => {
    spoken.push([text, volume]);
  };
  await h.arm();
  h.controller.configure(
    { ...h.controller.settings, volume: "softer", shortReplies: false },
    true,
    "trip-1",
  );
  await h.controller.send("ETA", true);
  assert.deepEqual(spoken, [["A longer response.", 0.65]]);
  await h.controller.dispose();
});
test("availability messages do not claim native voice works in Expo Go", () => {
  assert.match(wakeRequirement("development-build")!, /requires/);
  assert.match(wakeRequirement("setup-required")!, /Push-to-talk/);
  assert.equal(wakeRequirement("ready"), null);
});
test("independent audio leases cannot release another screen's microphone ownership", async () => {
  const h = harness();
  await h.arm();
  await h.controller.suspend(true, "card");
  await h.controller.suspend(true, "diagnostics");
  await h.controller.suspend(false, "card");
  assert.equal(h.microphone, null);
  await h.controller.listen();
  assert.equal(h.microphone, null);
  await h.controller.suspend(false, "diagnostics");
  assert.equal(h.microphone, "wake");
  await h.controller.dispose();
});
test("a failed global release refuses an external microphone handoff", async () => {
  const h = harness();
  await h.arm();
  h.ports.wake.stop = async () => {
    throw new Error("Native recorder busy");
  };
  assert.equal(await h.controller.suspend(true), false);
  assert.equal(h.controller.snapshot.phase, "error");
  h.ports.wake.stop = async () => {};
  await h.controller.dispose();
});
test("spoken failures stay consumer-readable and never read raw provider errors", async () => {
  const h = harness();
  let spoken = "";
  h.ports.assistant = async () => ({
    text: "raw provider payload",
    spokenText: "API-key-config-tool-json",
    error: true,
  });
  h.ports.tts.speak = (text) => {
    spoken = text;
  };
  await h.controller.send("Find coffee", true);
  assert.match(spoken, /Please try again/);
  assert.ok(!spoken.includes("API-key") && !spoken.includes("payload"));
  await h.controller.dispose();
});
