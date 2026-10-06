import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { AppState } from "react-native";
import * as Speech from "expo-speech";
import { useRoam } from "./RoamProvider";
import { mockReply } from "../services/ai";
import {
  AssistantEngine,
  type AssistantReply,
} from "../services/assistant/engine";
import { createAssistantTransport } from "../services/assistant/client";
import { googleConfiguration, roamAccessToken } from "../services/config";
import { speechInputModule } from "../services/speechInput";
import { placesService } from "../services/places";
import { isCancelled } from "../services/errors";
import type { Message, Place, VoiceState } from "../types/domain";

interface AssistantSession {
  messages: Message[];
  state: VoiceState;
  mode: "gemini" | "demo";
  voiceAvailable: boolean;
  voiceNotice: string | null;
  transcript: string;
  autoSpeak: boolean;
  setAutoSpeak: (value: boolean) => void;
  send: (message: string, fromVoice?: boolean) => Promise<void>;
  addPlace: (place: Place) => Promise<void>;
  toggleVoice: () => void;
  speak: (text: string) => void;
  stopVoice: () => void;
}
const AssistantContext = createContext<AssistantSession | null>(null);
export function AssistantProvider({ children }: PropsWithChildren) {
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
          ? "Hey, I’m ROAM. Ask me to find a stop or check your trip. Place cards and trip facts come from verified services."
          : "Hey, I’m ROAM. Connect the ROAM backend for Gemini. This conversation is a demo; the map’s existing searches and trip controls still work.",
    },
  ]);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const [state, setState] = useState<VoiceState>("idle");
  const stateRef = useRef(state);
  stateRef.current = state;
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [autoSpeak, setAutoSpeak] = useState(true);
  const autoSpeakRef = useRef(autoSpeak);
  autoSpeakRef.current = autoSpeak;
  const [recognition] = useState(speechInputModule);
  const engineRef = useRef<AssistantEngine | null>(null);
  if (!engineRef.current)
    engineRef.current = new AssistantEngine(
      createAssistantTransport(googleConfiguration.proxyUrl, roamAccessToken),
      placesService,
      {
        getSnapshot: () => roamRef.current.tripState,
        applyStopsAtomic: (trip, stops, signal) =>
          roamRef.current.applyAssistantStops(trip, stops, signal),
        cancel: () => roamRef.current.cancelTrip(),
      },
      () =>
        roamRef.current.fresh && roamRef.current.status === "ready"
          ? roamRef.current.coordinate
          : null,
    );
  const busy = useRef(false),
    mounted = useRef(true),
    serial = useRef(0),
    generation = useRef(0);
  const request = useRef<AbortController | null>(null),
    listening = useRef(false),
    spokenDraft = useRef("");
  const voiceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const append = (reply: AssistantReply) => {
    if (mounted.current)
      setMessages((previous) =>
        [
          ...previous,
          {
            ...reply,
            id: `message-${++serial.current}`,
            role: "assistant" as const,
          },
        ].slice(-60),
      );
  };
  const stopVoice = useCallback(() => {
    generation.current++;
    listening.current = false;
    if (voiceTimer.current) clearTimeout(voiceTimer.current);
    request.current?.abort();
    try {
      recognition?.abort();
    } catch {}
    void Speech.stop().catch(() => {});
    if (mounted.current) {
      setTranscript("");
      setState(busy.current ? "thinking" : "idle");
    }
  }, [recognition]);
  const speak = useCallback(
    (text: string) => {
      if (busy.current) return;
      stopVoice();
      const version = ++generation.current;
      setState("speaking");
      const finish = () => {
        if (mounted.current && version === generation.current) setState("idle");
      };
      void Speech.stop()
        .then(() => {
          if (
            mounted.current &&
            AppState.currentState === "active" &&
            version === generation.current
          )
            Speech.speak(text.slice(0, 500), {
              language: "en-US",
              rate: 0.95,
              onDone: finish,
              onStopped: finish,
              onError: finish,
            });
          else finish();
        })
        .catch(finish);
    },
    [stopVoice],
  );
  const send = async (input: string, fromVoice = false) => {
    const text = input.trim().slice(0, 1000);
    if (!text || busy.current) return;
    const wasDriving = Boolean(roamRef.current.tripState.trip?.startedAt);
    stopVoice();
    busy.current = true;
    setVoiceNotice(null);
    setState("thinking");
    const controller = new AbortController();
    request.current = controller;
    const history = messagesRef.current;
    const user: Message = {
      id: `message-${++serial.current}`,
      role: "user",
      text,
    };
    setMessages((previous) => [...previous, user].slice(-60));
    let response: AssistantReply | null = null;
    try {
      if (mode === "gemini")
        response = await engineRef.current!.send(
          text,
          history,
          controller.signal,
          (next) => {
            if (mounted.current && !controller.signal.aborted) setState(next);
          },
        );
      else {
        const current = roamRef.current;
        const demo = mockReply(text, {
          location: current.coordinate,
          destination: current.destination,
          activeRoute: current.tripState.trip?.route ?? null,
          speedMph: current.speedMph,
          time: new Date().toISOString(),
          weather: null,
          previousConversation: history,
          placesMode: placesService.mode,
        });
        response = { ...demo, spokenText: demo.text };
      }
      if (response && !controller.signal.aborted) append(response);
    } catch (error) {
      if (!isCancelled(error) && !controller.signal.aborted) {
        response = {
          text: "I couldn’t complete that request. Your map and trip controls still work.",
          spokenText: "Please try again.",
          error: true,
        };
        append(response);
      }
    } finally {
      busy.current = false;
      if (request.current === controller) request.current = null;
      if (mounted.current) setState(response?.error ? "error" : "idle");
    }
    if (
      response &&
      !controller.signal.aborted &&
      autoSpeakRef.current &&
      (fromVoice || wasDriving)
    )
      speak(response.spokenText);
  };
  const sendRef = useRef(send);
  sendRef.current = send;
  const addPlace = async (place: Place) => {
    if (busy.current) return;
    stopVoice();
    busy.current = true;
    setState("usingTool");
    const controller = new AbortController();
    request.current = controller;
    let reply: AssistantReply | null = null;
    try {
      reply = await engineRef.current!.addFromCard(place, controller.signal);
      if (!controller.signal.aborted) append(reply);
    } catch (error) {
      if (!isCancelled(error) && !controller.signal.aborted)
        append({
          text: "I couldn’t add that stop. Your trip was kept.",
          spokenText: "I couldn’t add that stop. Please try again.",
          error: true,
        });
    } finally {
      busy.current = false;
      if (request.current === controller) request.current = null;
      if (mounted.current) setState(reply?.error ? "error" : "idle");
    }
    if (
      reply &&
      !controller.signal.aborted &&
      autoSpeakRef.current &&
      roamRef.current.tripState.trip?.startedAt
    )
      speak(reply.spokenText);
  };
  useEffect(() => {
    mounted.current = true;
    const app = AppState.addEventListener("change", (next) => {
      if (next !== "active") stopVoice();
    });
    const listeners = recognition
      ? [
          recognition.addListener("result", (event) => {
            if (!listening.current) return;
            spokenDraft.current = event.results[0]?.transcript ?? "";
            setTranscript(spokenDraft.current);
            if (event.isFinal) setState("transcribing");
          }),
          recognition.addListener("end", () => {
            if (!listening.current) return;
            listening.current = false;
            if (voiceTimer.current) clearTimeout(voiceTimer.current);
            const text = spokenDraft.current.trim();
            setTranscript("");
            if (text) void sendRef.current(text, true);
            else {
              setState("idle");
              setVoiceNotice(
                "I didn’t catch that. Tap to speak again or type your request.",
              );
            }
          }),
          recognition.addListener("error", (event) => {
            if (!listening.current) return;
            listening.current = false;
            if (voiceTimer.current) clearTimeout(voiceTimer.current);
            setState("error");
            try {
              recognition.abort();
            } catch {}
            setVoiceNotice(
              event.error === "not-allowed"
                ? "Microphone or speech permission is off. Enable it in Settings, or type your request."
                : "Speech input is unavailable. Try again or type your request.",
            );
          }),
        ]
      : [];
    return () => {
      mounted.current = false;
      stopVoice();
      listeners.forEach((listener) => listener.remove());
      app.remove();
    };
  }, [recognition, stopVoice]);
  const toggleVoice = () => {
    if (stateRef.current === "speaking") {
      stopVoice();
      return;
    }
    if (listening.current) {
      setState("transcribing");
      try {
        recognition?.stop();
      } catch {
        stopVoice();
      }
      return;
    }
    if (busy.current) return;
    if (
      stateRef.current === "listening" ||
      stateRef.current === "transcribing"
    ) {
      stopVoice();
      return;
    }
    if (!recognition) {
      setVoiceNotice(
        "Speech input needs a ROAM development build. Text input and read-aloud work here.",
      );
      return;
    }
    stopVoice();
    const version = generation.current;
    setVoiceNotice(null);
    setState("listening");
    void recognition
      .requestPermissionsAsync()
      .then((permission) => {
        if (
          !mounted.current ||
          version !== generation.current ||
          AppState.currentState !== "active"
        )
          return;
        if (!permission.granted || !recognition.isRecognitionAvailable()) {
          setState("error");
          setVoiceNotice(
            "Speech permission or recognition is unavailable. Use Settings or type instead.",
          );
          return;
        }
        spokenDraft.current = "";
        listening.current = true;
        recognition.start({
          lang: "en-US",
          interimResults: true,
          continuous: false,
          recordingOptions: { persist: false },
        });
        voiceTimer.current = setTimeout(() => {
          if (listening.current) recognition.stop();
        }, 20000);
      })
      .catch(() => {
        if (mounted.current && version === generation.current) {
          setState("error");
          setVoiceNotice(
            "Couldn’t start speech input. Type your request instead.",
          );
        }
      });
  };
  return (
    <AssistantContext.Provider
      value={{
        messages,
        state,
        mode,
        voiceAvailable: Boolean(recognition),
        voiceNotice,
        transcript,
        autoSpeak,
        setAutoSpeak,
        send,
        addPlace,
        toggleVoice,
        speak,
        stopVoice,
      }}
    >
      {children}
    </AssistantContext.Provider>
  );
}
export function useAssistant() {
  const context = useContext(AssistantContext);
  if (!context) throw new Error("Assistant provider is missing.");
  return context;
}
