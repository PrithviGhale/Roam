import type { ActiveTrip, Place } from "../../types/domain";
export interface ResultReference {
  places: Place[];
  expires: number;
}
export interface PendingAction {
  action: "add" | "remove" | "cancel";
  id?: string;
  name?: string;
  trip: ActiveTrip;
  expires: number;
}
export const referenceLifetime = 10 * 60 * 1000;
export function ordinal(text: string): number | null {
  const match = text
    .toLowerCase()
    .match(/\b(first|second|third|fourth|fifth|[1-5])\b/);
  if (!match) return null;
  return (
    (
      { first: 1, second: 2, third: 3, fourth: 4, fifth: 5 } as Record<
        string,
        number
      >
    )[match[1]!] ?? Number(match[1])
  );
}
export const accepted = (text: string) =>
  /^(yes|yeah|yep|sure|ok|okay|do it|go ahead|please do|yes please)[.!\s]*$/i.test(
    text.trim(),
  );
export const explicit = (action: PendingAction["action"], text: string) =>
  action === "add"
    ? /\b(add|insert)\b|\bmake .* (a|the|my|our|next) stop\b/i.test(text) &&
      !/\b(don['’]?t|do not|not|never|avoid)\b/i.test(text)
    : action === "remove"
      ? /\b(remove|skip|delete)\b/i.test(text) &&
        !/\b(don['’]?t|do not|not|never)\b/i.test(text)
      : /^\s*(please\s+)?(cancel\s+(my\s+|the\s+)?(route|trip|navigation)|end\s+(my\s+|the\s+)?trip|stop\s+navigation)[.!\s]*$/i.test(
          text,
        );
export function resolveReference(
  places: Place[],
  input: string,
  args: {
    placeId?: string;
    resultIndex?: number;
    name?: string;
    stopId?: string;
  },
  allowSole = false,
): Place | null {
  // User's visible ordinal takes precedence over an incorrect model-selected ID.
  const index = ordinal(input) ?? args.resultIndex;
  if (index !== undefined && index !== null) return places[index - 1] ?? null;
  const userMatches = places.filter((place) =>
    input.toLowerCase().includes(place.name.toLowerCase()),
  );
  if (userMatches.length === 1) return userMatches[0]!;
  if (userMatches.length > 1) return null;
  if (args.name) {
    const matches = places.filter(
      (place) => place.name.toLowerCase() === args.name!.toLowerCase(),
    );
    return matches.length === 1 ? matches[0]! : null;
  }
  if (args.placeId || args.stopId)
    return (
      places.find((place) => place.id === (args.stopId ?? args.placeId)) ?? null
    );
  return allowSole && places.length === 1 ? places[0]! : null;
}
