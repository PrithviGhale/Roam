import type { RoutesService } from "../types/domain";
import {
  hasGoogleServices,
  googleConfiguration,
  roamAccessToken,
} from "./config";
import { createGoogleClient } from "./google/client";
import { createGoogleRoutesService } from "./google/routes";
import { ServiceError } from "./errors";
import { createProviderRoutes } from "./navigation/ProviderRoutes";
import type { NativeNavigation } from "../../modules/roam-navigation/src/types";
import type { RouteProvider } from "../types/domain";

export const unconfiguredRoutesService: RoutesService = {
  async getRoute() {
    throw new ServiceError(
      "configuration",
      "Google Routes is not connected. Set your ROAM Worker URL and restart Expo to plan real driving routes.",
    );
  },
};
const googleRoutesService: RoutesService = hasGoogleServices
  ? createGoogleRoutesService(
      createGoogleClient({
        ...googleConfiguration,
        accessToken: roamAccessToken,
      }),
    )
  : unconfiguredRoutesService;
let navigationModule: NativeNavigation | null = null;
let activeProvider: () => RouteProvider | null = () => null;
export function configureNavigationRouting(
  native: NativeNavigation | null,
  active: () => RouteProvider | null,
) {
  navigationModule = native;
  activeProvider = active;
}
export const routesService = createProviderRoutes(
  () => navigationModule,
  googleRoutesService,
  () => activeProvider(),
);
