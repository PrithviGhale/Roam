import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";
import { useLowPower } from "../contexts/PowerProvider";
export function useReducedMotion() {
  const lowPower = useLowPower();
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active) setReduced(value);
      })
      .catch(() => {});
    const listener = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduced,
    );
    return () => {
      active = false;
      listener.remove();
    };
  }, []);
  return reduced || lowPower === true;
}
