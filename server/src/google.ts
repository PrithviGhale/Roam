import { z } from "zod";
import {
  createGoogleClient,
  type GoogleRequest,
} from "../../src/services/google/client";
const coordinate = z
  .object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  })
  .strict();
const id = z.string().min(1).max(200);
const token = z.string().max(100).optional();
const circle = (radius: number) =>
  z
    .object({
      circle: z
        .object({
          center: coordinate,
          radius: z.number().positive().max(radius),
        })
        .strict(),
    })
    .strict();
const fields =
  "id,displayName,formattedAddress,location,primaryType,rating,userRatingCount,currentOpeningHours.openNow,businessStatus,attributions";
export const googleSchemas = {
  autocomplete: z
    .object({
      input: z.string().trim().min(2).max(200),
      languageCode: z.literal("en").optional(),
      sessionToken: token,
      locationBias: circle(50000).optional(),
    })
    .strict(),
  details: z.object({ placeId: id, sessionToken: token }).strict(),
  nearby: z
    .object({
      includedTypes: z
        .array(
          z.enum([
            "restaurant",
            "gas_station",
            "public_bathroom",
            "coffee_shop",
            "cafe",
            "parking",
          ]),
        )
        .min(1)
        .max(2),
      maxResultCount: z.number().int().min(1).max(10),
      rankPreference: z.literal("DISTANCE"),
      locationRestriction: circle(2000),
      sessionToken: token,
    })
    .strict(),
  "text-search": z
    .object({
      textQuery: z.string().trim().min(1).max(200),
      pageSize: z.number().int().min(1).max(10),
      locationBias: circle(50000).optional(),
      sessionToken: token,
    })
    .strict(),
  routes: z
    .object({
      origin: z
        .object({ location: z.object({ latLng: coordinate }).strict() })
        .strict(),
      destination: z.union([
        z.object({ placeId: id }).strict(),
        z
          .object({ location: z.object({ latLng: coordinate }).strict() })
          .strict(),
      ]),
      intermediates: z
        .array(z.object({ placeId: id }).strict())
        .max(5)
        .optional(),
      travelMode: z.literal("DRIVE"),
      routingPreference: z.literal("TRAFFIC_AWARE"),
      computeAlternativeRoutes: z.literal(false),
      polylineQuality: z.literal("HIGH_QUALITY"),
      polylineEncoding: z.literal("ENCODED_POLYLINE"),
      units: z.literal("IMPERIAL"),
      languageCode: z.literal("en-US"),
      sessionToken: token,
    })
    .strict(),
};
export function googleRequest(
  operation: string,
  value: unknown,
): GoogleRequest {
  if (!Object.hasOwn(googleSchemas, operation))
    throw new Error("unsupported-operation");
  const name = operation as keyof typeof googleSchemas;
  const body = googleSchemas[name].parse(value);
  const masks = {
    autocomplete:
      "suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat",
    details: fields,
    nearby: fields
      .split(",")
      .map((field) => `places.${field}`)
      .join(","),
    "text-search": fields
      .split(",")
      .map((field) => `places.${field}`)
      .join(","),
    routes:
      "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.viewport,routes.legs.distanceMeters,routes.legs.duration,routes.legs.startLocation,routes.legs.endLocation",
  };
  const { sessionToken: _token, ...payload } = body;
  return {
    operation: name,
    fieldMask: masks[name],
    ...(name === "details"
      ? { placeId: googleSchemas.details.parse(value).placeId }
      : { body: payload }),
  };
}
export async function proxyGoogle(
  operation: string,
  body: unknown,
  key: string,
  signal?: AbortSignal,
) {
  const request = googleRequest(operation, body);
  const sessionToken = z
    .object({ sessionToken: token })
    .passthrough()
    .parse(body).sessionToken;
  // Same HTTP implementation and response contract as V0.2. No duplicate Places/Routes provider.
  return createGoogleClient({ apiKey: key }).request(
    {
      ...request,
      ...(request.operation === "autocomplete" && sessionToken
        ? { body: { ...request.body, sessionToken } }
        : {}),
    },
    { sessionToken, signal },
  );
}
