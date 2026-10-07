import type { Coordinate } from "../types/domain";
import { validCoordinate } from "./location";
import { ServiceError } from "../services/errors";

export function decodePolyline(encoded: string): Coordinate[] {
  const fail = () => {
    throw new ServiceError(
      "invalid-data",
      "Google returned an invalid route line. Please retry.",
    );
  };
  if (!encoded || encoded.length > 1000000) return fail();
  let index = 0,
    latitude = 0,
    longitude = 0;
  const decode = () => {
    let result = 0,
      shift = 0,
      chunk: number;
    do {
      if (index >= encoded.length || shift > 30) return fail();
      chunk = encoded.charCodeAt(index++) - 63;
      if (chunk < 0 || chunk > 63) return fail();
      result |= (chunk & 31) << shift;
      shift += 5;
    } while (chunk >= 32);
    return result & 1 ? ~(result >>> 1) : result >>> 1;
  };
  const coordinates: Coordinate[] = [];
  while (index < encoded.length) {
    latitude += decode();
    longitude += decode();
    const coordinate = { latitude: latitude / 1e5, longitude: longitude / 1e5 };
    if (!validCoordinate(coordinate)) return fail();
    coordinates.push(coordinate);
  }
  if (coordinates.length < 2) return fail();
  return coordinates;
}
