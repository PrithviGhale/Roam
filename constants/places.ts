import type { PlaceCategory, Coordinate } from "../types/domain";

export const DEFAULT_COORDINATE: Coordinate = {
  latitude: 40.7411,
  longitude: -73.9897,
};
export const QUICK_ACTIONS: {
  category: PlaceCategory;
  label: string;
  icon:
    | "restaurant-outline"
    | "car-outline"
    | "man-outline"
    | "cafe-outline"
    | "square-outline";
}[] = [
  { category: "food", label: "Food", icon: "restaurant-outline" },
  { category: "gas", label: "Gas", icon: "car-outline" },
  { category: "restroom", label: "Restroom", icon: "man-outline" },
  { category: "coffee", label: "Coffee", icon: "cafe-outline" },
  { category: "parking", label: "Parking", icon: "square-outline" },
];
