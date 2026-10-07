import type { Coordinate, Place, Route, TripStop } from "../types/domain";
export interface MapCanvasProps {
  coordinate: Coordinate | null;
  heading: number | null;
  destination: Place | null;
  recenterToken: number;
  bottomInset: number;
  topInset?: number;
  recommendation?: Place | null;
  route: Route | null;
  stops: TripStop[];
}
