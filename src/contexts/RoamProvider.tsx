import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from "react";
import { useLocation } from "../hooks/useLocation";
import type { Place } from "../types/domain";
import { NavigationController } from "../services/navigation/NavigationController";
import { nativeNavigation } from "../../modules/roam-navigation/src";
import type { NavigationState } from "../services/navigation/NavigationController";
import { TripController } from "../services/tripController";
import { routesService } from "../services/routes";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  decodeRecovery,
  encodeRecovery,
  type RecoveredPlan,
} from "../services/tripRecovery";

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
  refreshRoute: TripController["refreshAtomic"];
  markStopVisited: TripController["markStopVisited"];
  navigationDiagnostics: TripController["diagnostics"];
  recoveredPlan: RecoveredPlan | null;
  restoreTripPlan(): Promise<void>;
  discardRecovery(): void;
  navigation: NavigationState;
  navigator: NavigationController;
  continueNavigationStop(): Promise<void>;
};
const RoamContext = createContext<RoamSession | null>(null);
export function RoamProvider({ children }: PropsWithChildren) {
  const location = useLocation();
  const [recoveredPlan, setRecoveredPlan] = useState<RecoveredPlan | null>(
    null,
  );
  const [recoveryLoaded, setRecoveryLoaded] = useState(false);
  const storageQueue = useRef(Promise.resolve());
  const recoveryGeneration = useRef(0);
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
  const [navigator] = useState(
    () => new NavigationController(nativeNavigation()),
  );
  const navigation = useSyncExternalStore(
    navigator.subscribe,
    navigator.getSnapshot,
    navigator.getSnapshot,
  );
  controller.nativeAuthority = navigation.mode === "native";
  controller.beforeNativeCommit = navigator.update;
  useEffect(() => {
    if (navigation.mode === "arrived") {
      controller.nativeAuthority = false;
      controller.finish();
    }
  }, [navigation.mode, controller]);
  useEffect(
    () => () => {
      void navigator.stop();
    },
    [navigator],
  );
  const startTrip = async () => {
    const expected = controller.getSnapshot().trip;
    if (
      navigator.getSnapshot().mode === "starting" ||
      !expected?.route ||
      expected.startedAt ||
      controller.getSnapshot().status !== "ready"
    )
      return;
    await navigator.start(expected);
    if (controller.getSnapshot().trip === expected) controller.start();
    else await navigator.stop();
  };
  const selectDestination = async (place: Place) => {
    await navigator.stop();
    await controller.selectDestination(place);
  };
  const tripState = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  useEffect(() => () => controller.dispose(), [controller]);
  useEffect(() => {
    let mounted = true;
    const generation = recoveryGeneration.current;
    void AsyncStorage.getItem("roam.active-plan")
      .then((value) => {
        if (
          mounted &&
          generation === recoveryGeneration.current &&
          !controller.getSnapshot().trip
        )
          setRecoveredPlan(decodeRecovery(value));
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setRecoveryLoaded(true);
      });
    return () => {
      mounted = false;
    };
  }, [controller]);
  useEffect(() => {
    if (!recoveryLoaded || (!tripState.trip && recoveredPlan)) return;
    const value = tripState.trip ? encodeRecovery(tripState.trip) : null;
    storageQueue.current = storageQueue.current
      .catch(() => {})
      .then(async () => {
        if (value) await AsyncStorage.setItem("roam.active-plan", value);
        else await AsyncStorage.removeItem("roam.active-plan");
      })
      .catch(() => {});
    // Persist only plan changes, never GPS progress updates.
  }, [recoveryLoaded, recoveredPlan, tripState.trip]);
  const discardRecovery = () => {
    recoveryGeneration.current++;
    setRecoveredPlan(null);
  };
  const cancelTrip = () => {
    discardRecovery();
    controller.cancel();
    void navigator.stop();
  };
  useEffect(() => {
    if (location.coordinate && location.timestamp !== null)
      controller.observeLocation({
        coordinate: location.coordinate,
        accuracy: location.accuracy,
        timestamp: location.timestamp,
        fresh: location.fresh,
      });
  }, [
    controller,
    location.coordinate,
    location.accuracy,
    location.timestamp,
    location.fresh,
    tripState.trip?.startedAt,
  ]);
  const destination = tripState.trip?.destination ?? null;
  const setDestination = (place: Place | null) => {
    if (place) void selectDestination(place);
    else cancelTrip();
  };
  return (
    <RoamContext.Provider
      value={{
        ...location,
        destination,
        setDestination,
        tripState,
        selectDestination,
        addTripStop: controller.addStop,
        removeTripStop: controller.removeStop,
        startTrip,
        cancelTrip,
        retryRoute: controller.retry,
        applyAssistantStops: controller.applyStopsAtomic,
        refreshRoute: controller.refreshAtomic,
        markStopVisited: (id) => {
          if (navigation.mode !== "native") controller.markStopVisited(id);
        },
        navigation,
        navigator,
        continueNavigationStop: async () => {
          const id = navigator.getSnapshot().waypointId;
          if (id && (await navigator.continueTrip()))
            controller.markStopVisited(id);
        },
        navigationDiagnostics: controller.diagnostics,
        recoveredPlan,
        discardRecovery,
        restoreTripPlan: async () => {
          if (recoveredPlan && location.fresh) {
            const plan = recoveredPlan;
            discardRecovery();
            await controller.restorePlan(plan);
          }
        },
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
