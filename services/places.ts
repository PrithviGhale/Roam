import { googleConfiguration, hasGoogleServices } from "./config";
import { createGoogleClient } from "./google/client";
import { createGooglePlacesService } from "./google/places";
import { demoPlacesService } from "./demoPlaces";

export const placesService = hasGoogleServices
  ? createGooglePlacesService(createGoogleClient(googleConfiguration))
  : demoPlacesService;
