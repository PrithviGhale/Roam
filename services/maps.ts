import { DEFAULT_COORDINATE } from "../constants/places";
import type { Coordinate } from "../types/domain";

export interface MapsService {
  regionFor(
    coordinate: Coordinate | null,
  ): Coordinate & { latitudeDelta: number; longitudeDelta: number };
}
export const mapsService: MapsService = {
  regionFor: (coordinate) => ({
    ...(coordinate ?? DEFAULT_COORDINATE),
    latitudeDelta: 0.016,
    longitudeDelta: 0.016,
  }),
};
