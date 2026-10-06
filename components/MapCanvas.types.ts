import type { Coordinate, Place } from "../types/domain";
export interface MapCanvasProps {
  coordinate: Coordinate | null;
  heading: number | null;
  destination: Place | null;
  recenterToken: number;
  bottomInset: number;
}
