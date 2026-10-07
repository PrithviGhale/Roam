import { drivingDistance, type NavigationState } from "./NavigationController";
export function navigationCommand(
  input: string,
  state: NavigationState,
  destination?: string,
): { action?: "recenter" | "silence"; text: string } | null {
  const text = input
    .toLowerCase()
    .trim()
    .replace(/[?.!]+$/, "");
  if (["recenter map", "recenter the map"].includes(text))
    return { action: "recenter", text: "Map centered." };
  if (["stop speaking", "be quiet"].includes(text))
    return { action: "silence", text: "" };
  if (state.mode !== "native") return null;
  if (state.updatedAt === null || Date.now() - state.updatedAt > 15000)
    return { text: "Live directions are unavailable right now." };
  if (["where am i going", "what's my destination"].includes(text))
    return {
      text: destination
        ? `You’re heading to ${destination}.`
        : "No destination is available.",
    };
  if (["what road am i on", "which road am i on"].includes(text))
    return {
      text: state.currentRoad
        ? `You’re on ${state.currentRoad}.`
        : "The current road name is not available.",
    };
  const repeats = [
    "repeat direction",
    "repeat that direction",
    "repeat the direction",
    "what's my next turn",
    "what is my next turn",
  ];
  if (repeats.includes(text))
    return {
      text:
        !state.rerouting && state.guidance
          ? state.guidance.instruction
          : "Updating directions. Please follow the road safely.",
    };
  if (
    [
      "how far to the next turn",
      "how far until the next turn",
      "how long until my exit",
    ].includes(text)
  )
    return {
      text:
        !state.rerouting && state.guidance
          ? `${drivingDistance(state.guidance.distanceToManeuverMeters)}. ${state.guidance.instruction}`
          : "The next turn is not available yet.",
    };
  return null;
}
