import type { RoutesService } from "../types/domain";
import { hasGoogleServices, googleConfiguration } from "./config";
import { createGoogleClient } from "./google/client";
import { createGoogleRoutesService } from "./google/routes";
import { ServiceError } from "./errors";

export const unconfiguredRoutesService: RoutesService = {
  async getRoute() {
    throw new ServiceError(
      "configuration",
      "Google Routes is not connected. Add your Google configuration and restart Expo to plan real driving routes.",
    );
  },
};
export const routesService: RoutesService = hasGoogleServices
  ? createGoogleRoutesService(createGoogleClient(googleConfiguration))
  : unconfiguredRoutesService;
