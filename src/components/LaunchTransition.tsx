import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  AppState,
  Easing,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import * as SplashScreen from "expo-splash-screen";
import { launchDuration, launchSession } from "../design/launch";
import { useLowPower } from "../contexts/PowerProvider";
export function LaunchTransition() {
  const [cold] = useState(() => launchSession.claim() === "cold"),
    [visible, setVisible] = useState(cold);
  const [minimal, setMinimal] = useState(true);
  const progress = useRef(new Animated.Value(0)).current;
  const { width, height } = useWindowDimensions(),
    lowPower = useLowPower();
  const started = useRef(false),
    power = useRef(lowPower);
  power.current = lowPower;
  useEffect(() => {
    if (!cold || started.current) return;
    let active = true;
    let animation: Animated.CompositeAnimation | undefined;
    let finished = false;
    const finish = () => {
      if (!finished && active) {
        finished = true;
        setVisible(false);
      }
    };
    const watchdog = setTimeout(() => {
      void SplashScreen.hideAsync().catch(() => {});
      finish();
    }, 1800);
    const app = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        animation?.stop();
        finish();
      }
    });
    void Promise.race([
      AccessibilityInfo.isReduceMotionEnabled().catch(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(true), 150)),
    ]).then((reduced) => {
      if (!active || finished) return;
      started.current = true;
      setMinimal(reduced || power.current === true);
      void SplashScreen.hideAsync().catch(() => {});
      animation = Animated.timing(progress, {
        toValue: 1,
        duration: launchDuration(reduced || power.current === true),
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      });
      animation.start(finish);
    });
    return () => {
      active = false;
      clearTimeout(watchdog);
      animation?.stop();
      app.remove();
    };
  }, [cold, progress]);
  if (!visible) return null;
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        StyleSheet.absoluteFill,
        {
          zIndex: 100,
          backgroundColor: "#101416",
          opacity: progress.interpolate({
            inputRange: minimal ? [0, 1] : [0, 0.72, 1],
            outputRange: minimal ? [1, 0] : [1, 1, 0],
          }),
        },
      ]}
    >
      {[0, 1, 2].map((lane) => (
        <Animated.View
          key={lane}
          style={{
            position: "absolute",
            left: width / 2 - 4,
            top: height / 2 - 24,
            width: 8,
            height: lane === 1 ? 48 : 38,
            backgroundColor: "#D6B785",
            borderRadius: 5,
            transform: [
              {
                translateX: minimal
                  ? (lane - 1) * 19
                  : progress.interpolate({
                      inputRange: [0, 0.25, 0.58, 0.82, 1],
                      outputRange: [
                        (lane - 1) * 19,
                        (lane - 1) * 19,
                        (lane - 1) * width * 0.23,
                        (lane - 1) * 8 + width * 0.125,
                        (lane - 1) * 8 + width * 0.125,
                      ],
                    }),
              },
              {
                translateY: minimal
                  ? 0
                  : progress.interpolate({
                      inputRange: [0, 0.25, 0.58, 0.82, 1],
                      outputRange: [
                        0,
                        lane === 1 ? -18 : 10,
                        -40,
                        height / 2 - 58,
                        height / 2 - 58,
                      ],
                    }),
              },
              {
                scaleY: minimal
                  ? 1
                  : progress.interpolate({
                      inputRange: [0, 0.25, 0.58, 0.82, 1],
                      outputRange: [1, 1.5, height / 30, 0.45, 0.45],
                    }),
              },
              {
                scaleX: minimal
                  ? 1
                  : progress.interpolate({
                      inputRange: [0, 0.58, 0.82, 1],
                      outputRange: [1, 1.6, 0.45, 0.45],
                    }),
              },
              { skewX: "-16deg" },
            ],
          }}
        />
      ))}
    </Animated.View>
  );
}
