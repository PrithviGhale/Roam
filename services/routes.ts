import type { RoutesService } from "../types/domain";

export const routesService: RoutesService = {
  async getRoute() {
    throw new Error(
      "Routing is not connected yet. ROAM V0.1 previews destinations without turn-by-turn guidance.",
    );
  },
};
