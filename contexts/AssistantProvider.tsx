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
import { sendMessageToRoam } from "../services/ai";
import type { Message, VoiceState } from "../types/domain";

interface AssistantSession {
  messages: Message[];
  state: VoiceState;
  send: (message: string) => Promise<void>;
  toggleVoice: () => void;
  speak: (text: string) => void;
  stopVoice: () => void;
}
const AssistantContext = createContext<AssistantSession | null>(null);
export function AssistantProvider({ children }: PropsWithChildren) {
  const { coordinate, destination, speedMph } = useRoam();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "Hey, I’m ROAM. A good road starts with a little curiosity. Where shall we go? Try a prompt below to explore the demo.",
    },
  ]);
  const [state, setState] = useState<VoiceState>("idle");
  const busy = useRef(false);
  const mounted = useRef(true);
  const serial = useRef(0);
  const speechGeneration = useRef(0);
  const stopVoice = useCallback(() => {
    speechGeneration.current++;
    void Speech.stop().catch(() => {});
    if (mounted.current) setState(busy.current ? "processing" : "idle");
  }, []);
  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener("change", (next) => {
      if (next !== "active") stopVoice();
    });
    return () => {
      mounted.current = false;
      speechGeneration.current++;
      void Speech.stop().catch(() => {});
      subscription.remove();
    };
  }, [stopVoice]);
  const send = async (input: string) => {
    const text = input.trim().slice(0, 1000);
    if (!text || busy.current) return;
    stopVoice();
    busy.current = true;
    setState("processing");
    const user: Message = {
      id: `message-${++serial.current}`,
      role: "user",
      text,
    };
    const history = [...messages, user];
    setMessages(history);
    try {
      const reply = await sendMessageToRoam(text, {
        location: coordinate,
        destination,
        activeRoute: null,
        speedMph,
        time: new Date().toISOString(),
        weather: null,
        previousConversation: history,
      });
      if (mounted.current)
        setMessages((previous) => [
          ...previous,
          { ...reply, id: `message-${++serial.current}`, role: "assistant" },
        ]);
    } catch {
      if (mounted.current)
        setMessages((previous) => [
          ...previous,
          {
            id: `message-${++serial.current}`,
            role: "assistant",
            text: "I couldn’t answer that request. Try again in a moment.",
          },
        ]);
    } finally {
      busy.current = false;
      if (mounted.current) setState("idle");
    }
  };
  const speak = (text: string) => {
    if (busy.current) return;
    const generation = ++speechGeneration.current;
    setState("speaking");
    const finish = () => {
      if (mounted.current && generation === speechGeneration.current)
        setState("idle");
    };
    void Speech.stop()
      .then(() => {
        if (mounted.current && generation === speechGeneration.current)
          Speech.speak(text, {
            language: "en-US",
            rate: 0.95,
            onDone: finish,
            onStopped: finish,
            onError: finish,
          });
      })
      .catch(finish);
  };
  return (
    <AssistantContext.Provider
      value={{
        messages,
        state,
        send,
        speak,
        stopVoice,
        toggleVoice: () => {
          if (busy.current) return;
          if (state === "listening" || state === "speaking") stopVoice();
          else setState("listening");
        },
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
