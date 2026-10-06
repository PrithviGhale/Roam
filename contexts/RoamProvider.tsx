import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
  type PropsWithChildren,
} from "react";
import { useLocation } from "../hooks/useLocation";
import type { Place } from "../types/domain";
import { TripController } from "../services/tripController";
import { routesService } from "../services/routes";

type RoamSession = ReturnType<typeof useLocation> & {
  destination: Place | null;
  setDestination: (place: Place | null) => void;
  tripState: ReturnType<TripController["getSnapshot"]>;
  selectDestination: TripController["selectDestination"];
  addTripStop: TripController["addStop"];
  removeTripStop: TripController["removeStop"];
  startTrip: TripController["start"];
  cancelTrip: TripController["cancel"];
  retryRoute: TripController["retry"];
  applyAssistantStops: TripController["applyStopsAtomic"];
};
const RoamContext = createContext<RoamSession | null>(null);
export function RoamProvider({ children }: PropsWithChildren) {
  const location = useLocation();
  const locationRef = useRef(location);
  locationRef.current = location;
  const controllerRef = useRef<TripController | null>(null);
  if (!controllerRef.current)
    controllerRef.current = new TripController(routesService, () =>
      locationRef.current.fresh && locationRef.current.status === "ready"
        ? locationRef.current.coordinate
        : null,
    );
  const controller = controllerRef.current;
  const tripState = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  useEffect(() => () => controller.dispose(), [controller]);
  const destination = tripState.trip?.destination ?? null;
  const setDestination = (place: Place | null) => {
    if (place) void controller.selectDestination(place);
    else controller.cancel();
  };
  return (
    <RoamContext.Provider
      value={{
        ...location,
        destination,
        setDestination,
        tripState,
        selectDestination: controller.selectDestination,
        addTripStop: controller.addStop,
        removeTripStop: controller.removeStop,
        startTrip: controller.start,
        cancelTrip: controller.cancel,
        retryRoute: controller.retry,
        applyAssistantStops: controller.applyStopsAtomic,
      }}
    >
      {children}
    </RoamContext.Provider>
  );
}
export function useRoam() {
  const context = useContext(RoamContext);
  if (!context) throw new Error("ROAM session provider is missing.");
  return context;
}
