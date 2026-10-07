import { DetourService } from "./detours";
import { routesService } from "./routes";
// Shared between quick actions and the assistant; cache never persists across app sessions.
export const detourService = new DetourService(routesService);
