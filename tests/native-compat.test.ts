import { test } from "node:test";
import assert from "node:assert/strict";
import { patchVoiceProcessor } from "../scripts/patch-native-compat.mjs";

const old = `Pod::Spec.new do |s|
  s.dependency 'ios-voice-processor', '~> 1.2.0'
  # Don't install the dependencies when we run \`pod install\` in the old architecture.
  if ENV['RCT_NEW_ARCH_ENABLED'] == '1' then
    s.dependency "React-Codegen"
    s.dependency "RCT-Folly"
  end
end
`;
test("native compatibility uses RN's helper without obsolete Folly dependencies", () => {
  const result = patchVoiceProcessor(old);
  assert.ok(result.includes("install_modules_dependencies(s)"));
  assert.ok(!result.includes("RCT-Folly"));
  assert.ok(result.includes("s.dependency 'ios-voice-processor', '~> 1.2.0'"));
});
test("native dependency patch is idempotent across repeated installs", () => {
  const result = patchVoiceProcessor(old);
  assert.equal(patchVoiceProcessor(result), result);
});
test("changed upstream podspec requires review instead of silent partial patching", () => {
  assert.throws(() => patchVoiceProcessor("unrecognized podspec"), /changed/);
});
