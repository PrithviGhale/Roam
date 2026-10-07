import assert from "node:assert/strict";
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
  assert.equal(exp.version, "0.5.0");
  assert.equal(exp.ios?.bundleIdentifier, "com.prithvighale.roam");
  const serialized = JSON.stringify(exp.extra ?? {}).toLowerCase();
  assert.ok(
    !serialized.includes("accesskey") && !serialized.includes("access-key"),
  );
  console.log(
    "Native config passed: SDK 57 / V0.5, microphone/speech/foreground location, no background audio/location, no wake AccessKey in public extra.",
  );
}
void main().catch(() => {
  console.error(
    "Native configuration check failed. Inspect app.config and its plugins without logging credentials.",
  );
  process.exitCode = 1;
});
