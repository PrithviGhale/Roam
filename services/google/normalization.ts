import type {
  Coordinate,
  Place,
  PlaceCategory,
  PlaceSuggestion,
} from "../../types/domain";
import { validCoordinate } from "../../utils/location";
import { ServiceError } from "../errors";

export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function string(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
export function finite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}
export function googleCoordinate(value: unknown): Coordinate | null {
  const object = record(value);
  const latitude = finite(object.latitude),
    longitude = finite(object.longitude);
  return latitude !== undefined &&
    longitude !== undefined &&
    validCoordinate({ latitude, longitude })
    ? { latitude, longitude }
    : null;
}
export function normalizeSuggestions(value: unknown): PlaceSuggestion[] {
  const suggestions = record(value).suggestions;
  if (!Array.isArray(suggestions)) return [];
  return suggestions.flatMap((item) => {
    const prediction = record(record(item).placePrediction),
      format = record(prediction.structuredFormat);
    const id = string(prediction.placeId),
      name =
        string(record(format.mainText).text) ??
        string(record(prediction.text).text);
    return id && name
      ? [
          {
            id,
            name,
            subtitle: string(record(format.secondaryText).text) ?? "",
            source: "verified" as const,
          },
        ]
      : [];
  });
}
export function normalizePlace(
  value: unknown,
  category: PlaceCategory | "destination" = "destination",
): Place {
  const object = record(value),
    id = string(object.id),
    name = string(record(object.displayName).text),
    coordinate = googleCoordinate(object.location);
  if (!id || !name || !coordinate)
    throw new ServiceError(
      "invalid-data",
      "This place has no usable location. Choose another result.",
    );
  const address = string(object.formattedAddress),
    rating = finite(object.rating),
    count = finite(object.userRatingCount);
  const opening = record(object.currentOpeningHours);
  const rawAttributions = Array.isArray(object.attributions)
    ? object.attributions
    : [];
  return {
    id,
    name,
    subtitle: address ?? string(object.primaryType)?.replace(/_/g, " ") ?? "",
    coordinate,
    category,
    source: "verified",
    ...(address ? { address } : {}),
    ...(rating !== undefined && rating >= 0 && rating <= 5 ? { rating } : {}),
    ...(count !== undefined && count >= 0 ? { ratingCount: count } : {}),
    ...(typeof opening.openNow === "boolean"
      ? { openNow: opening.openNow }
      : {}),
    ...(string(object.businessStatus)
      ? { businessStatus: string(object.businessStatus) }
      : {}),
    ...(string(object.primaryType)
      ? { primaryType: string(object.primaryType) }
      : {}),
    attributions: rawAttributions.flatMap((item) => {
      const attribution = record(item),
        provider = string(attribution.provider);
      return provider
        ? [
            {
              provider,
              ...(string(attribution.providerUri)
                ? { uri: string(attribution.providerUri) }
                : {}),
            },
          ]
        : [];
    }),
  };
}
export function normalizePlaceResults(
  value: unknown,
  category: PlaceCategory | "destination",
): Place[] {
  const places = record(value).places;
  if (!Array.isArray(places)) return [];
  return places.flatMap((place) => {
    try {
      return [normalizePlace(place, category)];
    } catch {
      return [];
    }
  });
}
