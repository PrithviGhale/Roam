import { DEFAULT_COORDINATE } from "../constants/places";
import type {
  Coordinate,
  Place,
  PlaceCategory,
  PlacesService,
} from "../types/domain";

const catalog: Record<PlaceCategory, { name: string; subtitle: string }[]> = {
  food: [
    { name: "Juniper Kitchen", subtitle: "Seasonal plates · Casual dining" },
    { name: "The Corner Table", subtitle: "Neighborhood café · Comfort food" },
    { name: "Little Olive", subtitle: "Mediterranean · Quick bites" },
  ],
  gas: [
    { name: "Roadside Fuel", subtitle: "Fuel station · Convenience store" },
    { name: "Next Mile", subtitle: "Fuel station · Road essentials" },
  ],
  restroom: [
    {
      name: "Community Visitor Center",
      subtitle: "Public facilities · Visitor information",
    },
    { name: "Riverside Rest Stop", subtitle: "Rest area · Facilities" },
  ],
  coffee: [
    { name: "Daybreak Coffee", subtitle: "Coffee bar · Pastries" },
    { name: "Sunday Roasters", subtitle: "Specialty coffee · Light bites" },
  ],
  parking: [
    { name: "Market Street Garage", subtitle: "Covered garage · City parking" },
    { name: "Parkside Lot", subtitle: "Open-air lot · Parking" },
  ],
};
function demoPlaces(
  category: PlaceCategory,
  origin: Coordinate | null,
): Place[] {
  const center = origin ?? DEFAULT_COORDINATE;
  return catalog[category].map((place, index) => ({
    ...place,
    id: `demo-${category}-${index}`,
    category,
    source: "mock",
    coordinate: {
      latitude: Math.max(
        -89.9,
        Math.min(89.9, center.latitude + 0.002 * (index + 1)),
      ),
      longitude: ((center.longitude + 0.0025 * (index + 1) + 180) % 360) - 180,
    },
  }));
}
// Replace this adapter with a backend Places API client. Never represent fixtures as verified places.
export const demoPlacesService: PlacesService = {
  mode: "demo",
  async search(query, origin) {
    const normalized = query.trim().toLowerCase();
    const places = (Object.keys(catalog) as PlaceCategory[]).flatMap(
      (category) => demoPlaces(category, origin),
    );
    return normalized
      ? places.filter((place) =>
          `${place.name} ${place.subtitle} ${place.category}`
            .toLowerCase()
            .includes(normalized),
        )
      : places.slice(0, 4);
  },
  async nearby(category, origin) {
    return demoPlaces(category, origin);
  },
  async autocomplete(query, origin) {
    const places = await demoPlacesService.search(query, origin);
    return places.map((place) => ({
      id: place.id,
      name: place.name,
      subtitle: place.subtitle,
      source: "mock",
      demoPlace: place,
    }));
  },
  async getDetails(suggestion) {
    if (!suggestion.demoPlace) throw new Error("Demo place unavailable.");
    return suggestion.demoPlace;
  },
  async alongRoute(category, origin) {
    return demoPlaces(category, origin);
  },
};
