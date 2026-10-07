import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getPrebuildConfigAsync } from "@expo/prebuild-config";
import { compileModsAsync } from "expo/config-plugins";
async function main() {
  const root = process.cwd();
  const { exp } = await getPrebuildConfigAsync(root, { platforms: ["ios"] });
  const config = await compileModsAsync(exp, {
    projectRoot: root,
    platforms: ["ios"],
    introspect: true,
  });
  const plist = config._internal?.modResults?.ios?.infoPlist;
  assert.ok(plist, "iOS permission configuration was not generated");
  assert.ok(plist.NSMicrophoneUsageDescription?.includes("Hey ROAM"));
  assert.ok(plist.NSSpeechRecognitionUsageDescription);
  assert.ok(plist.NSLocationWhenInUseUsageDescription);
  assert.ok(!plist.NSLocationAlwaysUsageDescription);
  assert.ok(!plist.NSLocationAlwaysAndWhenInUseUsageDescription);
  assert.ok(!plist.UIBackgroundModes?.includes("audio"));
  assert.ok(!plist.UIBackgroundModes?.includes("location"));
  assert.equal(exp.sdkVersion, "57.0.0");
  assert.equal(exp.version, "0.7.0");
  assert.equal(exp.ios?.bundleIdentifier, "com.prithvighale.roam");
  assert.equal(exp.orientation, "portrait");
  const eas = JSON.parse(readFileSync("eas.json", "utf8"));
  assert.equal(eas.build.development.developmentClient, true);
  assert.equal(eas.build.development.distribution, "internal");
  assert.equal(eas.build.development.environment, "development");
  assert.equal(eas.build.development.env.ROAM_ENABLE_NAVIGATION, "false");
  assert.equal(eas.build.preview.env.ROAM_ENABLE_NAVIGATION, "false");
  assert.equal(
    plist.ROAMNavigationEnabled,
    process.env.ROAM_ENABLE_NAVIGATION === "true",
  );
  const module = JSON.parse(
    readFileSync("modules/roam-navigation/expo-module.config.json", "utf8"),
  );
  assert.deepEqual(module.apple.modules, ["RoamNavigationModule"]);
  const pod = readFileSync(
    "modules/roam-navigation/ios/RoamNavigation.podspec",
    "utf8",
  );
  assert.ok(pod.includes("vendor/GoogleNavigation.xcframework"));
  const manifest = JSON.parse(readFileSync("package.json", "utf8"));
  assert.ok(manifest.scripts["eas-build-pre-install"]);
  assert.ok(!manifest.scripts["eas-build-post-install"]);
  const serialized = JSON.stringify(exp.extra ?? {}).toLowerCase();
  assert.ok(
    !serialized.includes("accesskey") && !serialized.includes("access-key"),
  );
  console.log(
    "Native config passed: SDK 57 / V0.7, microphone/speech/foreground location, no background audio/location, no wake AccessKey in public extra.",
  );
}
void main().catch(() => {
  console.error(
    "Native configuration check failed. Inspect app.config and its plugins without logging credentials.",
  );
  process.exitCode = 1;
});
