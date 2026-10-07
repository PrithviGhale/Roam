import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform, Text, TextInput, View } from "react-native";
import Constants from "expo-constants";
import { useLowPower } from "../contexts/PowerProvider";
import { useRouteProgress } from "../hooks/useRouteProgress";
import { Redirect, router, useFocusEffect } from "expo-router";
import * as Location from "expo-location";
import * as Speech from "expo-speech";
import { Page } from "../components/Page";
import { Button, Eyebrow, Panel } from "../components/ui";
import { useRoam } from "../contexts/RoamProvider";
import { useAssistant } from "../contexts/AssistantProvider";
import { useTheme } from "../themes/ThemeProvider";
import { googleConfiguration, roamAccessToken } from "../services/config";
import { speechInputModule } from "../services/speechInput";
import {
  createDiagnosticClient,
  type DiagnosticResult,
  type DiagnosticService,
} from "../services/diagnostics";

const untested: DiagnosticResult = {
  state: "notTested",
  detail: "Not tested in this session.",
};
export default function DiagnosticsScreen() {
  if (!__DEV__) return <Redirect href="/profile" />;
  return <DevDiagnostics />;
}
function DevDiagnostics() {
  const {
    theme: { colors },
  } = useTheme();
  const roam = useRoam();
  const assistant = useAssistant();
  const lowPower = useLowPower();
  const progress = useRouteProgress();
  const [clock, setClock] = useState(Date.now());
  const [observe, setObserve] = useState(false);
  const [diagnosticTts, setDiagnosticTts] = useState(false);
  const voice = assistant.voiceDiagnostics();
  const navigation = roam.navigationDiagnostics();
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const [wakeKey, setWakeKey] = useState("");
  const [wakeNote, setWakeNote] = useState<string | null>(null);
  const [recognition] = useState(speechInputModule);
  const [client] = useState(() =>
    createDiagnosticClient(googleConfiguration.proxyUrl, roamAccessToken),
  );
  const [checks, setChecks] = useState<Record<string, DiagnosticResult>>({
    worker: untested,
    authentication: untested,
    gemini: untested,
    places: untested,
    routes: untested,
    tts: untested,
  });
  const [permissions, setPermissions] = useState({
    location: "not tested",
    microphone: "not tested",
    speech: "not tested",
  });
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [confidence, setConfidence] = useState<number | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true),
    version = useRef(0),
    work = useRef(false);
  const capturing = useRef(false);
  const playback = useRef(false);
  const request = useRef<AbortController | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const update = (name: string, value: DiagnosticResult) => {
    if (mounted.current) setChecks((prev) => ({ ...prev, [name]: value }));
  };
  const stop = useCallback(() => {
    version.current++;
    const ownedCapture = capturing.current;
    capturing.current = false;
    request.current?.abort();
    if (timer.current) clearTimeout(timer.current);
    try {
      if (ownedCapture) recognition?.abort();
    } catch {}
    if (playback.current) {
      playback.current = false;
      void Speech.stop().catch(() => {});
    }
    if (mounted.current) {
      setDiagnosticTts(false);
      setListening(false);
      setBusy(false);
      setChecks((previous) =>
        Object.fromEntries(
          Object.entries(previous).map(([name, value]) => [
            name,
            value.state === "checking"
              ? { state: "notTested" as const, detail: "Check cancelled." }
              : value,
          ]),
        ),
      );
    }
    work.current = false;
  }, [recognition]);
  useFocusEffect(
    useCallback(() => {
      void assistant.suspendVoice(!observe);
      return () => {
        if (!observe) stop();
        void assistant.suspendVoice(false);
      };
    }, [assistant.suspendVoice, stop, observe]),
  );
  useEffect(() => {
    mounted.current = true;
    const app = AppState.addEventListener("change", (state) => {
      if (state !== "active") stop();
    });
    const listeners = recognition
      ? [
          recognition.addListener("start", () => {
            if (mounted.current && capturing.current) setListening(true);
          }),
          recognition.addListener("result", (event) => {
            if (!mounted.current || !capturing.current) return;
            const result = event.results[0];
            setTranscript(result?.transcript ?? "");
            setConfidence(
              result && result.confidence >= 0 ? result.confidence : null,
            );
          }),
          recognition.addListener("end", () => {
            if (!capturing.current) return;
            capturing.current = false;
            if (timer.current) clearTimeout(timer.current);
            if (mounted.current) setListening(false);
          }),
          recognition.addListener("error", () => {
            if (!capturing.current) return;
            capturing.current = false;
            if (timer.current) clearTimeout(timer.current);
            if (mounted.current) {
              setListening(false);
              setVoiceError(
                "Recognition failed. Check permissions, locale, or network; text input is still available.",
              );
            }
          }),
        ]
      : [];
    return () => {
      mounted.current = false;
      stop();
      app.remove();
      listeners.forEach((listener) => listener.remove());
    };
  }, [recognition, stop]);
  const checkPermissions = async () => {
    const attempt = version.current;
    try {
      const location = await Location.getForegroundPermissionsAsync();
      const mic = await recognition?.getMicrophonePermissionsAsync();
      const speech = await recognition?.getSpeechRecognizerPermissionsAsync();
      if (mounted.current && version.current === attempt)
        setPermissions({
          location: location.status,
          microphone: mic?.status ?? "native module unavailable",
          speech: speech?.status ?? "native module unavailable",
        });
    } catch {
      if (mounted.current)
        setVoiceError("Permission status could not be read.");
    }
  };
  useEffect(() => {
    void checkPermissions();
  }, [recognition]);
  const network = async (
    name: "worker" | "authentication" | DiagnosticService,
  ) => {
    if (work.current || listening) return;
    work.current = true;
    setBusy(true);
    const attempt = version.current,
      controller = new AbortController();
    request.current = controller;
    update(name, { state: "checking", detail: "Checking…" });
    try {
      if (name === "authentication") {
        const value = await client.authentication(controller.signal);
        if (controller.signal.aborted) return;
        update(name, value.result);
        for (const [service, state] of Object.entries(value.services ?? {}))
          update(service, {
            state,
            detail:
              state === "configured"
                ? "Server credential configured; provider not tested."
                : "Server credential missing.",
          });
      } else {
        const result =
          name === "worker"
            ? await client.health(controller.signal)
            : await client.probe(name, controller.signal);
        if (!controller.signal.aborted) update(name, result);
      }
    } finally {
      if (mounted.current && attempt === version.current) {
        setBusy(false);
        work.current = false;
      }
    }
  };
  const startListening = async () => {
    if (
      observe ||
      !recognition ||
      work.current ||
      capturing.current ||
      diagnosticTts
    )
      return;
    work.current = true;
    setBusy(true);
    if (!(await assistant.suspendVoice(true))) {
      work.current = false;
      setBusy(false);
      return;
    }
    if (!mounted.current || AppState.currentState !== "active") {
      work.current = false;
      if (mounted.current) setBusy(false);
      return;
    }
    stop();
    const attempt = version.current;
    work.current = true;
    setBusy(true);
    setVoiceError(null);
    try {
      const permission = await recognition.requestPermissionsAsync();
      if (
        !mounted.current ||
        attempt !== version.current ||
        AppState.currentState !== "active"
      )
        return;
      if (!permission.granted) {
        setVoiceError(
          "Microphone and speech permissions are required. Check iPhone Settings.",
        );
        return;
      }
      setTranscript("");
      setConfidence(null);
      capturing.current = true;
      recognition.start({
        lang: "en-US",
        interimResults: true,
        continuous: false,
        maxAlternatives: 1,
        recordingOptions: { persist: false },
      });
      timer.current = setTimeout(() => {
        try {
          recognition.stop();
        } catch {
          stop();
        }
      }, 20_000);
    } catch {
      if (mounted.current) setVoiceError("Speech recognition could not start.");
    } finally {
      if (mounted.current && attempt === version.current) {
        setBusy(false);
        work.current = false;
      }
    }
  };
  const testTts = async () => {
    if (observe || work.current || capturing.current || diagnosticTts) return;
    work.current = true;
    setBusy(true);
    if (!(await assistant.suspendVoice(true))) {
      work.current = false;
      setBusy(false);
      return;
    }
    if (!mounted.current || AppState.currentState !== "active") {
      work.current = false;
      if (mounted.current) setBusy(false);
      return;
    }
    stop();
    work.current = true;
    setBusy(true);
    const attempt = version.current;
    update("tts", { state: "checking", detail: "Checking voices…" });
    try {
      const voices = await Speech.getAvailableVoicesAsync();
      if (
        !mounted.current ||
        attempt !== version.current ||
        AppState.currentState !== "active"
      )
        return;
      update("tts", {
        state: voices.length ? "configured" : "unavailable",
        detail: voices.length
          ? `${voices.length} system voices available. Confirm audible playback manually.`
          : "No system voices reported.",
      });
      const finishPlayback = () => {
        if (mounted.current && attempt === version.current) {
          playback.current = false;
          setDiagnosticTts(false);
          setBusy(false);
          work.current = false;
          if (timer.current) clearTimeout(timer.current);
        }
      };
      timer.current = setTimeout(stop, 45000);
      playback.current = true;
      Speech.speak("ROAM voice check. Ready for the road.", {
        language: "en-US",
        onDone: () => {
          finishPlayback();
          if (mounted.current && attempt === version.current)
            setDiagnosticTts(false);
          if (mounted.current && attempt === version.current)
            update("tts", {
              state: "connected",
              detail: "Playback completion reported; confirm you heard it.",
            });
        },
        onError: () => {
          finishPlayback();
          if (mounted.current && attempt === version.current)
            setDiagnosticTts(false);
          if (mounted.current && attempt === version.current)
            update("tts", { state: "unavailable", detail: "Playback failed." });
        },
        onStopped: finishPlayback,
        onStart: () => {
          if (mounted.current && attempt === version.current)
            setDiagnosticTts(true);
        },
      });
    } catch {
      if (mounted.current && attempt === version.current) {
        setBusy(false);
        work.current = false;
      }
      update("tts", {
        state: "unavailable",
        detail: "System voices could not be queried.",
      });
    }
  };
  const line = (label: string, value: string) => (
    <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 20 }}>
      {label}: {value}
    </Text>
  );
  return (
    <Page
      title="Device diagnostics"
      subtitle="Development only · Test while parked"
    >
      <Button secondary onPress={() => router.back()}>
        Back
      </Button>
      <Panel style={{ gap: 8 }}>
        <Eyebrow>DEVICE / NATIVE BUILD</Eyebrow>
        {line("OS", `${Platform.OS} ${Platform.Version}`)}
        {line(
          "App / build",
          `${Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? "unknown"} / ${Constants.nativeBuildVersion ?? "not reported"}`,
        )}
        {line(
          "Expo SDK / environment",
          `${Constants.expoConfig?.sdkVersion ?? "57.0.0"} / ${Constants.executionEnvironment}`,
        )}
        {line(
          "Low Power Mode",
          lowPower === null
            ? "unavailable"
            : lowPower
              ? "enabled · animations reduced"
              : "off",
        )}
        <Button
          secondary
          disabled={busy || capturing.current || diagnosticTts}
          onPress={() => setObserve((value) => !value)}
        >
          {observe
            ? "Pause session for isolated checks"
            : "Observe active trip audio"}
        </Button>
        {line(
          "Audio owner",
          listening
            ? "diagnostic recognition"
            : diagnosticTts
              ? "diagnostic TTS"
              : voice.audioOwner,
        )}
        {line(
          "TTS / recognition active",
          `${voice.native.ttsActive || diagnosticTts} / ${voice.native.recognitionActive || listening}`,
        )}
        <Text style={{ color: colors.muted }}>
          Observation allows normal trip voice. Pause before isolated
          microphone/TTS checks.
        </Text>
      </Panel>
      <Panel style={{ gap: 12 }}>
        <Eyebrow>HEY ROAM · DEVICE SETUP</Eyebrow>
        {line("Native/model availability", assistant.wakeAvailability)}
        {line(
          "Installed wake model found",
          String(voice.native.modelFound ?? "not checked"),
        )}
        {line(
          "Picovoice AccessKey",
          voice.native.accessKeyConfigured === null
            ? "not checked"
            : voice.native.accessKeyConfigured
              ? "configured"
              : "missing",
        )}
        {line(
          "Porcupine initialized / state",
          `${voice.native.initialized} / ${voice.native.state}`,
        )}
        {line("Wake failure", voice.native.failure ?? "none")}
        {line("Wake armed", String(assistant.voice.wakeActive))}
        {line("Sensitivity (session only)", String(voice.native.sensitivity))}
        <View style={{ gap: 8 }}>
          {[0.35, 0.5, 0.65].map((value) => (
            <Button
              key={value}
              secondary
              disabled={observe || busy || listening}
              onPress={() => {
                void assistant
                  .setWakeSensitivity(value)
                  .then(() => setWakeNote(`Sensitivity set to ${value}.`))
                  .catch(() => setWakeNote("Could not change sensitivity."));
              }}
            >
              Sensitivity {value}
              {value === 0.5 ? " · default" : ""}
            </Button>
          ))}
        </View>
        {line(
          "Successful voice commands / canceled wakes / empty wakes",
          `${voice.voiceCommands} / ${voice.canceledWakeSessions} / ${voice.emptyWakeSessions}`,
        )}
        {line(
          "Recognition / TTS seconds (session)",
          `${Math.round(voice.recognitionMs / 1000)} / ${Math.round(voice.ttsMs / 1000)}`,
        )}
        {line(
          "Last assistant transcript",
          assistant.messages.findLast((message) => message.role === "user")
            ?.text ?? "none",
        )}
        {line(
          "Wake active seconds (RAM only)",
          String(Math.round(assistant.voiceDiagnostics().wakeActiveMs / 1000)),
        )}
        {line(
          "Wake activations",
          String(assistant.voiceDiagnostics().activations),
        )}
        {line(
          "Speech sessions",
          String(assistant.voiceDiagnostics().speechSessions),
        )}
        {line(
          "Concurrent wake / TTS",
          "Disabled pending physical iOS validation",
        )}
        <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 20 }}>
          Generate an iOS Hey ROAM model in Picovoice Console and rebuild with
          assets/wake/hey-roam_ios.ppn. Enter your AccessKey here on this
          device. It is stored in SecureStore and never logged or sent to the
          ROAM backend. Check Picovoice licensing before distribution.
        </Text>
        <TextInput
          accessibilityLabel="Picovoice AccessKey"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          value={wakeKey}
          onChangeText={setWakeKey}
          placeholder="Device AccessKey"
          placeholderTextColor={colors.muted}
          style={{
            minHeight: 52,
            paddingHorizontal: 12,
            color: colors.text,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: 12,
          }}
        />
        <Button
          secondary
          disabled={
            assistant.wakeAvailability === "development-build" ||
            !wakeKey.trim() ||
            observe ||
            busy ||
            capturing.current ||
            diagnosticTts
          }
          onPress={() => {
            void assistant
              .configureWakeKey(wakeKey)
              .then(() => {
                setWakeKey("");
                setWakeNote(
                  "AccessKey saved on this device. Return to an active trip and enable Hey ROAM.",
                );
              })
              .catch(() =>
                setWakeNote(
                  "Device setup could not be saved. Use the iOS development build.",
                ),
              );
          }}
        >
          Save device key
        </Button>
        <Button
          secondary
          disabled={
            observe ||
            busy ||
            capturing.current ||
            diagnosticTts ||
            assistant.wakeAvailability === "development-build"
          }
          onPress={() => {
            void assistant
              .configureWakeKey("")
              .then(() => setWakeNote("Device key removed."))
              .catch(() => setWakeNote("Could not remove the key."));
          }}
        >
          Remove device key
        </Button>
        {wakeNote && (
          <Text style={{ color: colors.text, fontSize: 13 }}>{wakeNote}</Text>
        )}
      </Panel>
      <Panel style={{ gap: 8 }}>
        <Eyebrow>FOREGROUND GPS</Eyebrow>
        {line("Permission", permissions.location)}
        {line(
          "GPS session seconds",
          String(Math.round(roam.gpsSessionMs / 1000)),
        )}
        {line(
          "Fix age seconds",
          roam.timestamp === null
            ? "unavailable"
            : String(Math.max(0, Math.round((clock - roam.timestamp) / 1000))),
        )}
        {line(
          "Displayed speed MPH",
          roam.speedMph === null ? "unavailable" : String(roam.speedMph),
        )}
        {line(
          "GPS",
          `${roam.status}${roam.fresh ? " · fresh" : " · stale/unavailable"}`,
        )}
        {line(
          "Latitude / longitude",
          roam.coordinate
            ? `${roam.coordinate.latitude.toFixed(6)}, ${roam.coordinate.longitude.toFixed(6)}`
            : "unavailable",
        )}
        {line(
          "Accuracy",
          roam.accuracy === null
            ? "unavailable"
            : `${roam.accuracy.toFixed(1)} m`,
        )}
        {line(
          "Speed",
          roam.rawSpeed === null
            ? "unavailable"
            : `${roam.rawSpeed.toFixed(1)} m/s`,
        )}
        {line(
          "Heading",
          roam.heading === null ? "unavailable" : `${roam.heading.toFixed(0)}°`,
        )}
        {line(
          "Timestamp",
          roam.timestamp === null
            ? "unavailable"
            : new Date(roam.timestamp).toLocaleTimeString(),
        )}
        {line(
          "Route tracking",
          roam.tripState.tracking?.state ?? "not started",
        )}
        <Button secondary onPress={() => void checkPermissions()}>
          Read permissions
        </Button>
      </Panel>
      <Panel style={{ gap: 8 }}>
        <Eyebrow>NAVIGATION / SESSION EVENTS</Eyebrow>
        {line(
          "Started / route loaded",
          `${!!roam.tripState.trip?.startedAt} / ${!!roam.tripState.trip?.route}`,
        )}
        {line(
          "Progress",
          progress?.estimated
            ? `${progress.percentageCompleted.toFixed(1)}% · GPS estimate`
            : "unavailable / last route snapshot",
        )}
        {line(
          "Distance from route",
          navigation.distanceFromRoute === null
            ? "unavailable"
            : `${Math.round(navigation.distanceFromRoute)} m`,
        )}
        {line(
          "Off-route samples / cooldown seconds",
          `${navigation.offRouteSamples} / ${Math.ceil(navigation.cooldownMs / 1000)}`,
        )}
        {line("Last reroute reason", navigation.lastRerouteReason ?? "none")}
        {voice.events
          .slice()
          .reverse()
          .map((entry, index) => (
            <Text
              key={`${entry.timestamp}-${index}`}
              style={{ color: colors.muted, fontSize: 12 }}
            >
              {new Date(entry.timestamp).toLocaleTimeString()} {entry.event}
            </Text>
          ))}
        <Text style={{ color: colors.muted }}>
          Latest 80 event labels in memory. No keys, microphone content or
          transcripts in the event log; no upload.
        </Text>
      </Panel>
      <Panel style={{ gap: 12 }}>
        <Eyebrow>NETWORK · NO PHONE GPS SENT</Eyebrow>
        <Text style={{ color: colors.muted, fontSize: 12 }}>
          Health/auth checks make no provider calls. Each Places or Routes probe
          makes one billable request using fixed Boston coordinates. Gemini
          checks model metadata, not inference. Five diagnostic requests per
          minute.
        </Text>
        {(
          ["worker", "authentication", "gemini", "places", "routes"] as const
        ).map((name) => (
          <View key={name} style={{ gap: 5 }}>
            {line(name, `${checks[name]!.state} · ${checks[name]!.detail}`)}
            <Button
              secondary
              disabled={busy || listening}
              onPress={() => void network(name)}
            >
              {name === "worker"
                ? "Check Worker health"
                : name === "authentication"
                  ? "Check authenticated access"
                  : `Run ${name} probe${name === "gemini" ? "" : " (1 paid request)"}`}
            </Button>
          </View>
        ))}
      </Panel>
      <Panel style={{ gap: 10 }}>
        <Eyebrow>VOICE · NO REQUEST SENT TO GEMINI</Eyebrow>
        {line("Microphone", permissions.microphone)}
        {line("Speech permission", permissions.speech)}
        {line(
          "Speech module",
          recognition
            ? "available in this build"
            : "Voice input requires the ROAM development build.",
        )}
        {line(
          "Recognizer",
          recognition?.isRecognitionAvailable() ? "available" : "unavailable",
        )}
        {line("Recognized text", transcript || "none")}
        {line(
          "Confidence",
          confidence === null ? "unavailable" : confidence.toFixed(2),
        )}
        {voiceError && (
          <Text style={{ color: colors.danger }}>{voiceError}</Text>
        )}
        <Button
          disabled={
            observe || !recognition || busy || listening || diagnosticTts
          }
          onPress={() => void startListening()}
        >
          Start listening
        </Button>
        <Button
          secondary
          disabled={!listening && !capturing.current}
          onPress={() => {
            try {
              recognition?.stop();
            } catch {
              stop();
            }
          }}
        >
          Stop listening
        </Button>
        {line("TTS", `${checks.tts!.state} · ${checks.tts!.detail}`)}
        <Button
          secondary
          disabled={observe || busy || listening || diagnosticTts}
          onPress={() => void testTts()}
        >
          Test read-aloud
        </Button>
        <Button secondary onPress={stop}>
          Stop playback / cancel checks
        </Button>
        <Text style={{ color: colors.muted, fontSize: 11 }}>
          Diagnostic text and GPS stay in screen memory only. Speech audio
          persistence is disabled. The OS recognizer may use its network speech
          service.
        </Text>
      </Panel>
    </Page>
  );
}
