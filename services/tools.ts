import type {
  Coordinate,
  Place,
  PlaceCategory,
  PlacesService,
} from "../types/domain";
import type { TripController } from "./tripController";
import { ServiceError } from "./errors";

// Shared verified operations for future AI function calling. No AI is connected in V0.2.
export function createTripTools(
  places: PlacesService,
  trip: TripController,
  getLocation: () => Coordinate | null,
) {
  const search = (category: PlaceCategory) => {
    const origin = getLocation();
    if (!origin)
      throw new ServiceError(
        "location",
        "A current location is needed to search for stops.",
      );
    const route = trip.getSnapshot().trip?.route;
    return route
      ? places.alongRoute(category, origin, route)
      : places.nearby(category, origin);
  };
  return {
    searchFood: () => search("food"),
    searchGas: () => search("gas"),
    searchRestrooms: () => search("restroom"),
    searchCoffee: () => search("coffee"),
    searchParking: () => search("parking"),
    addTripStop: (place: Place) => trip.addStop(place),
    removeTripStop: (id: string) => trip.removeStop(id),
    getCurrentRoute: () => trip.getSnapshot().trip?.route ?? null,
  };
}
