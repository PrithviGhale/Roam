import {
  createContext,
  useContext,
  useState,
  type PropsWithChildren,
} from "react";
import { useLocation } from "../hooks/useLocation";
import type { Place } from "../types/domain";

type RoamSession = ReturnType<typeof useLocation> & {
  destination: Place | null;
  setDestination: (place: Place | null) => void;
};
const RoamContext = createContext<RoamSession | null>(null);
export function RoamProvider({ children }: PropsWithChildren) {
  const location = useLocation();
  const [destination, setDestination] = useState<Place | null>(null);
  return (
    <RoamContext.Provider value={{ ...location, destination, setDestination }}>
      {children}
    </RoamContext.Provider>
  );
}
export function useRoam() {
  const context = useContext(RoamContext);
  if (!context) throw new Error("ROAM session provider is missing.");
  return context;
}
