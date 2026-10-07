import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRoam } from "./RoamProvider";
import { mockReply } from "../services/ai";
import {
  AssistantEngine,
  type AssistantReply,
} from "../services/assistant/engine";
import { createAssistantTransport } from "../services/assistant/client";
import { googleConfiguration, roamAccessToken } from "../services/config";
import { placesService } from "../services/places";
import { detourService } from "../services/recommendations";
import { VoiceController } from "../services/voice/VoiceController";
import { nativeAudioPorts, saveWakeKey } from "../services/voice/nativePorts";
import {
  defaultVoiceSettings,
  type VoiceSettings,
} from "../services/voice/types";
import { acknowledge } from "../services/haptics";
import { tripMode } from "../design/layout";
import { AssistantRetry } from "../services/assistant/retry";
import type { ActiveTrip } from "../types/domain";
import type { Message, Place, VoiceState } from "../types/domain";
import { navigationCommand } from "../services/navigation/commands";
import { GuidanceSpeech } from "../services/navigation/GuidanceSpeech";

function useSession() {
  const roam = useRoam();
  const roamRef = useRef(roam);
  roamRef.current = roam;
  const mode = googleConfiguration.proxyUrl ? "gemini" : "demo";
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      text:
        mode === "gemini"
          ? "Wherever you’re heading, I’m here. Find a stop, check your arrival, or ask about your trip."
          : "Welcome to ROAM. This assistant is in demo mode until your backend is connected.",
    },
  ]);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const mounted = useRef(true),
    serial = useRef(0);
  const [settings, setSettings] = useState<VoiceSettings>(defaultVoiceSettings);
  const [loaded, setLoaded] = useState(false);
  const [cardPending, setCardPending] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);
  const retry = useRef(new AssistantRetry<ActiveTrip | null>());
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const engineRef = useRef<AssistantEngine | null>(null);
  if (!engineRef.current)
    engineRef.current = new AssistantEngine(
      createAssistantTransport(
        googleConfiguration.proxyUrl,
        roamAccessToken,
        fetch,
        () => {
          const nav = roamRef.current.navigation;
          const g =
            nav.mode === "native" &&
            !nav.rerouting &&
            nav.updatedAt !== null &&
            Date.now() - nav.updatedAt < 15000
              ? nav.guidance
              : null;
          return g
            ? {
                nextInstruction: g.instruction.slice(0, 500),
                distanceToManeuverMeters: g.distanceToManeuverMeters,
                remainingDistanceMeters: g.remainingDistanceMeters,
                remainingDurationSeconds: g.remainingDurationSeconds,
              }
            : null;
        },
      ),
      placesService,
      {
        getSnapshot: () => ({
          ...roamRef.current.tripState,
          progress: roamRef.current.tripState.progress ?? null,
          navigation: roamRef.current.navigation,
        }),
        applyStopsAtomic: (trip, stops, signal) =>
          roamRef.current.applyAssistantStops(trip, stops, signal),
        cancel: () => roamRef.current.cancelTrip(),
        refreshAtomic: (trip, signal) =>
          roamRef.current.refreshRoute(trip, signal),
      },
      () =>
        roamRef.current.fresh && roamRef.current.status === "ready"
          ? roamRef.current.coordinate
          : null,
      undefined,
      detourService,
      () => roamRef.current.accuracy,
    );
  const append = (reply: AssistantReply) => {
    if (mounted.current)
      setMessages((previous) =>
        [
          ...previous,
          {
            ...reply,
            ...(reply.error
              ? {
                  text: "ROAM couldn’t complete that request. Please try again.",
                  spokenText:
                    "ROAM couldn’t complete that request. Please try again.",
                }
              : {}),
            id: `message-${++serial.current}`,
            role: "assistant" as const,
          },
        ].slice(-60),
      );
  };
  const [audio] = useState(nativeAudioPorts);
  const [controller] = useState(
    () =>
      new VoiceController({
        ...audio,
        acknowledge,
        clearConfirmation: () => engineRef.current!.clearPendingConfirmation(),
        async assistant(input, signal, state) {
          const context = roamRef.current.tripState.trip;
          const history = messagesRef.current;
          if (mounted.current)
            setMessages((previous) =>
              [
                ...previous,
                {
                  id: `message-${++serial.current}`,
                  role: "user" as const,
                  text: input,
                },
              ].slice(-60),
            );
          let reply: AssistantReply;
          const local = navigationCommand(
            input,
            roamRef.current.navigation,
            roamRef.current.destination?.name,
          );
          if (local) {
            if (local.action === "recenter")
              roamRef.current.navigator.setCamera("FOLLOW");
            if (local.action === "overview")
              roamRef.current.navigator.setCamera("OVERVIEW");
            reply = { text: local.text, spokenText: local.text };
          } else if (mode === "gemini")
            reply = await engineRef.current!.send(
              input,
              history,
              signal,
              (next) => {
                if (next === "thinking" || next === "usingTool") state(next);
              },
            );
          else {
            const current = roamRef.current;
            const demo = mockReply(input, {
              location: current.coordinate,
              destination: current.destination,
              activeRoute: current.tripState.trip?.route ?? null,
              speedMph: current.speedMph,
              time: new Date().toISOString(),
              weather: null,
              previousConversation: history,
              placesMode: placesService.mode,
            });
            reply = { ...demo, spokenText: demo.text };
          }
          if (!signal.aborted) {
            retry.current.record(
              input,
              reply.retryKind ?? "conversation",
              context,
              !!reply.error,
            );
            setRetryVersion((value) => value + 1);
            append(reply);
          }
          return {
            ...reply,
            confirmation: engineRef.current!.hasPendingConfirmation(),
          };
        },
      }),
  );
  const voice = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const [foreground, setForeground] = useState(
    AppState.currentState === "active",
  );
  const trip =
    tripMode(roam.tripState) === "driving"
      ? `${roam.tripState.trip!.destination.id}:${roam.tripState.trip!.startedAt}`
      : null;
  useEffect(() => {
    controller.configure(settings, foreground, trip);
    if (foreground) void audio.inspect().catch(() => {});
  }, [controller, settings, foreground, trip]);
  const [guidanceSpeech] = useState(() => new GuidanceSpeech());
  useEffect(() => {
    if (AppState.currentState !== "active" || !roam.tripState.trip?.startedAt)
      return;
    const prompt = guidanceSpeech.next(roam.navigation);
    if (prompt) void controller.speak(prompt.text, prompt.priority);
    if (roam.navigation.mode !== "native") guidanceSpeech.reset();
  }, [
    roam.navigation,
    roam.tripState.trip?.startedAt,
    controller,
    guidanceSpeech,
  ]);
  useEffect(() => {
    if (roam.navigation.mode !== "native") {
      guidanceSpeech.reset();
      void controller.stopNavigationSpeech();
    }
  }, [roam.navigation.mode, controller, guidanceSpeech]);

  useEffect(() => {
    mounted.current = true;
    void AsyncStorage.getItem("roam.voice.preferences")
      .then((value) => {
        if (!mounted.current) return;
        if (value) {
          try {
            const saved = JSON.parse(value);
            setSettings({
              heyRoam: saved.heyRoam === true,
              autoSpeak: saved.autoSpeak !== false,
              shortReplies: saved.shortReplies !== false,
              volume: saved.volume === "softer" ? "softer" : "system",
            });
          } catch {}
        }
        setLoaded(true);
      })
      .catch(() => {
        if (mounted.current) setLoaded(true);
      });
    const app = AppState.addEventListener("change", (next) => {
      const active = next === "active";
      controller.configure(
        settingsRef.current,
        active,
        tripMode(roamRef.current.tripState) === "driving"
          ? `${roamRef.current.tripState.trip!.destination.id}:${roamRef.current.tripState.trip!.startedAt}`
          : null,
      );
      setForeground(active);
    });
    return () => {
      mounted.current = false;
      app.remove();
      controller.configure(settingsRef.current, false, null);
      queueMicrotask(() => {
        if (!mounted.current) void controller.dispose();
      });
    };
  }, [controller]);
  useEffect(() => {
    if (loaded)
      void AsyncStorage.setItem(
        "roam.voice.preferences",
        JSON.stringify(settings),
      ).catch(() => {});
  }, [loaded, settings]);
  const updateVoiceSettings = useCallback(
    (next: Partial<VoiceSettings>) =>
      setSettings((previous) => ({ ...previous, ...next })),
    [],
  );
  const stopVoice = useCallback(() => {
    void controller.cancel();
  }, [controller]);
  const suspendVoice = useCallback(
    (suspended: boolean) => {
      if (suspended) {
        addRequest.current?.abort();
        engineRef.current!.clearPendingConfirmation();
      }
      return controller.suspend(suspended, "diagnostics");
    },
    [controller],
  );
  const state: VoiceState = cardPending
    ? "usingTool"
    : [
          "armed",
          "inactive",
          "cooldown",
          "wakeDetected",
          "initializing",
          "preparing",
          "speechPending",
        ].includes(voice.phase)
      ? "idle"
      : (voice.phase as VoiceState);
  const addBusy = useRef(false);
  const addRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!foreground) addRequest.current?.abort();
    return () => {
      addRequest.current?.abort();
    };
  }, [foreground]);
  const addPlace = async (place: Place) => {
    if (addBusy.current || state === "thinking" || state === "usingTool")
      return;
    addBusy.current = true;
    setCardPending(true);
    const request = new AbortController();
    addRequest.current = request;
    if (!(await controller.suspend(true, "trip-card"))) {
      addBusy.current = false;
      if (mounted.current) setCardPending(false);
      addRequest.current = null;
      await controller.suspend(false, "trip-card");
      return;
    }
    let reply: AssistantReply | null = null;
    try {
      reply = await engineRef.current!.addFromCard(place, request.signal);
      if (!request.signal.aborted) {
        append(reply);
        if (!reply.error) acknowledge();
      }
    } catch {
      if (!request.signal.aborted)
        append({
          text: "ROAM couldn’t add that stop. Your trip was kept.",
          spokenText: "Please try again.",
          error: true,
        });
    } finally {
      addBusy.current = false;
      if (mounted.current) setCardPending(false);
      addRequest.current = null;
      await controller.suspend(false, "trip-card");
    }
    if (
      reply &&
      !request.signal.aborted &&
      settingsRef.current.autoSpeak &&
      roamRef.current.tripState.trip?.startedAt
    )
      await controller.speak(
        reply.error
          ? "ROAM couldn’t add that stop. Please try again."
          : reply.spokenText,
      );
  };
  return {
    messages,
    state,
    mode,
    voice,
    voicePhase: cardPending ? ("usingTool" as const) : voice.phase,
    voiceAvailable: audio.speech.available,
    voiceNotice: voice.notice,
    transcript: voice.transcript,
    autoSpeak: settings.autoSpeak,
    setAutoSpeak: (value: boolean) => updateVoiceSettings({ autoSpeak: value }),
    settings,
    updateVoiceSettings,
    send: (text: string, fromVoice = false) => {
      if (
        navigationCommand(text, roamRef.current.navigation)?.action ===
        "silence"
      )
        return controller.cancel(false);
      return controller.send(text, fromVoice);
    },
    addPlace,
    toggleVoice: () => {
      if (["listening", "transcribing", "preparing"].includes(voice.phase))
        void controller.cancel();
      else void controller.listen();
    },
    speak: (text: string) => {
      void controller.speak(text);
    },
    stopVoice,
    suspendVoice,
    voiceDiagnostics: () => {
      const diagnostics = controller.diagnostics(),
        native = audio.diagnostics();
      return {
        ...diagnostics,
        native,
        audioOwner:
          native.state === "armed"
            ? "wake"
            : native.recognitionActive
              ? "recognition"
              : native.ttsActive
                ? "tts"
                : ["tts", "recognition"].includes(diagnostics.audioOwner)
                  ? "none (transition)"
                  : diagnostics.audioOwner,
      };
    },
    retryKind: retry.current.status(roam.tripState.trip),
    retryVersion,
    retryAssistant: async () => {
      if (
        cardPending ||
        ["thinking", "usingTool"].includes(controller.snapshot.phase)
      )
        return;
      const input = retry.current.take(roamRef.current.tripState.trip);
      setRetryVersion((value) => value + 1);
      if (input) await controller.send(input);
    },
    setWakeSensitivity: async (value: number) => {
      if (!__DEV__) return;
      if (!(await controller.suspend(true, "configuration")))
        throw new Error("Audio could not be released.");
      try {
        await audio.wake.dispose();
        audio.setSensitivity(value);
      } finally {
        await controller.suspend(false, "configuration");
      }
    },
    wakeAvailability: audio.wake.availability(),
    configureWakeKey: async (key: string) => {
      if (!(await controller.suspend(true, "configuration")))
        throw new Error("Audio could not be released.");
      try {
        await audio.wake.dispose();
        await saveWakeKey(key);
        await audio.inspect();
      } finally {
        await controller.suspend(false, "configuration");
      }
    },
  };
}
const AssistantContext = createContext<ReturnType<typeof useSession> | null>(
  null,
);
export function AssistantProvider({ children }: PropsWithChildren) {
  const session = useSession();
  return (
    <AssistantContext.Provider value={session}>
      {children}
    </AssistantContext.Provider>
  );
}
export function useAssistant() {
  const context = useContext(AssistantContext);
  if (!context) throw new Error("Assistant provider is missing.");
  return context;
}
