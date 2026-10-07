import { useRoam } from "../contexts/RoamProvider";
import { StatusCard } from "./StatusCard";
export function LocationNotice() {
  const { status, canAskAgain, retry, fresh } = useRoam();
  if (status === "ready" && fresh) return null;
  const pending = status === "locating" || status === "requesting";
  return (
    <StatusCard
      loading={pending}
      title={
        pending
          ? "Finding your position"
          : status === "denied"
            ? "Location access is off"
            : "Waiting for a location signal"
      }
      detail={
        status === "denied"
          ? "Allow location to plan a route and find nearby stops."
          : "Speed and route progress need a recent, accurate GPS position."
      }
      action={
        pending
          ? undefined
          : status === "denied" && !canAskAgain
            ? "Open Settings"
            : "Retry location"
      }
      onPress={retry}
    />
  );
}
