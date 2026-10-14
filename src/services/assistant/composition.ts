import type { Place } from "../../types/domain";
export function localConversation(input: string): string | null {
  const text = input
    .trim()
    .replace(/[.!?]+$/, "")
    .toLowerCase();
  if (/^(hi|hello|hey|hey roam)$/.test(text)) return "Hey. Where are we going?";
  if (/^(thanks|thank you|cheers|thanks roam)$/.test(text))
    return "Anytime. Enjoy the drive.";
  return null;
}
import {
  openings,
  groundedPhrasing,
  type Phrasing,
} from "../../../shared/composition";
export function recommendationText(
  place: Place,
  driving: boolean,
  phrasing?: Phrasing,
) {
  const style = groundedPhrasing(phrasing, driving) ?? {
    opening: "none" as const,
    detail: "brief" as const,
  };
  const seconds = place.verifiedDetour?.durationSeconds;
  const detour =
    seconds === undefined
      ? "Driving detour isn't available yet"
      : Math.abs(seconds) < 30
        ? "has almost no added driving time"
        : `${seconds < 0 ? "saves" : "adds"} about ${Math.max(1, Math.round(Math.abs(seconds) / 60))} minute${Math.round(Math.abs(seconds) / 60) === 1 ? "" : "s"}`;
  const name =
    place.name.length > 70 && driving
      ? `${place.name.slice(0, 67)}…`
      : place.name;
  const core =
    seconds === undefined
      ? `${name} is an option. ${detour}.`
      : `${name} ${detour}.`;
  const displayText = `${driving ? "" : openings[style.opening]}${core}${!driving && style.detail === "compare" && place.rating !== undefined ? ` It's rated ${place.rating.toFixed(1)}.` : ""} Want to add ${driving ? "it" : place.name} as a stop?`;
  const spokenText = driving
    ? `${seconds === undefined ? `${name}; detour unavailable.` : core} Want to add it?`
    : displayText;
  return { text: displayText, spokenText };
}
