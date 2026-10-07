import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Text, View } from "react-native";
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
  const request = useRef<AbortController | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const update = (name: string, value: DiagnosticResult) => {
    if (mounted.current) setChecks((prev) => ({ ...prev, [name]: value }));
  };
  const stop = useCallback(() => {
    version.current++;
    capturing.current = false;
    request.current?.abort();
    if (timer.current) clearTimeout(timer.current);
    try {
      recognition?.abort();
    } catch {}
    void Speech.stop().catch(() => {});
    if (mounted.current) {
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
      assistant.stopVoice();
      return stop;
    }, [assistant.stopVoice, stop]),
  );
  useEffect(() => {
    mounted.current = true;
    const app = AppState.addEventListener("change", (state) => {
      if (state !== "active") stop();
    });
    const listeners = recognition
      ? [
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
    if (!recognition || work.current || listening) return;
    assistant.stopVoice();
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
      setListening(true);
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
    if (busy || listening) return;
    assistant.stopVoice();
    stop();
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
      Speech.speak("ROAM voice check. Ready for the road.", {
        language: "en-US",
        onDone: () => {
          if (mounted.current && attempt === version.current)
            update("tts", {
              state: "connected",
              detail: "Playback completion reported; confirm you heard it.",
            });
        },
        onError: () => {
          if (mounted.current && attempt === version.current)
            update("tts", { state: "unavailable", detail: "Playback failed." });
        },
      });
    } catch {
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
        <Eyebrow>FOREGROUND GPS</Eyebrow>
        {line("Permission", permissions.location)}
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
          disabled={!recognition || busy || listening}
          onPress={() => void startListening()}
        >
          Start listening
        </Button>
        <Button
          secondary
          disabled={!listening}
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
          disabled={busy || listening}
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
