const {
  withInfoPlist,
  withPodfileProperties,
  withXcodeProject,
} = require("expo/config-plugins");
const frameworks = ["MapboxCommon", "MapboxCoreMaps", "MapboxNavigationNative"];
function embedMapboxFrameworks(project) {
  const target = project.getFirstTarget();
  const name = "[ROAM] Embed Mapbox runtime frameworks";
  const phases = project.hash.project.objects.PBXShellScriptBuildPhase ?? {};
  if (
    target.firstTarget.buildPhases.some(
      (ref) => phases[ref.value]?.name === `"${name}"`,
    )
  )
    return;
  const script = [
    "set -eu",
    'destination="${TARGET_BUILD_DIR}/${FRAMEWORKS_FOLDER_PATH}"',
    'mkdir -p "$destination"',
    `for framework in ${frameworks.join(" ")}; do`,
    '  source="${BUILT_PRODUCTS_DIR}/${framework}.framework"',
    '  if [ ! -d "$source" ]; then',
    '    source=$(/usr/bin/find "$BUILT_PRODUCTS_DIR" -maxdepth 4 -type d -name "${framework}.framework" -print -quit)',
    "  fi",
    '  if [ ! -d "$source" ]; then echo "error: Missing Mapbox runtime framework: $framework" >&2; exit 1; fi',
    '  /usr/bin/ditto "$source" "$destination/${framework}.framework"',
    '  if [ "${CODE_SIGNING_ALLOWED:-NO}" = "YES" ] && [ -n "${EXPANDED_CODE_SIGN_IDENTITY:-}" ]; then',
    '    /usr/bin/codesign --force --sign "$EXPANDED_CODE_SIGN_IDENTITY" --preserve-metadata=identifier,entitlements "$destination/${framework}.framework"',
    "  fi",
    "done",
  ].join("\n");
  const result = project.addBuildPhase(
    [],
    "PBXShellScriptBuildPhase",
    name,
    target.uuid,
    {
      shellPath: "/bin/sh",
      shellScript: script.replace(/\n/g, "\\n"),
      outputPaths: frameworks.map(
        (name) =>
          `"$(TARGET_BUILD_DIR)/$(FRAMEWORKS_FOLDER_PATH)/${name}.framework"`,
      ),
    },
  );
  result.buildPhase.alwaysOutOfDate = 1;
}
module.exports = function withRoamNavigation(config) {
  config = withInfoPlist(config, (config) => {
    config.modResults.ROAMNavigationEnabled = false;
    config.modResults.ROAMNavigationProvider = "mapbox";
    config.modResults.MBXAccessToken =
      process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim() || "";
    return config;
  });
  config = withPodfileProperties(config, (config) => {
    // Expo 57's precompiled React/Expo libraries require static CocoaPods linkage.
    // RN's spm_dependency hook links Core only in the local module target.
    // Adding Core to the application too causes duplicate SDK symbols.
    config.modResults["ios.useFrameworks"] = "static";
    return config;
  });
  return withXcodeProject(config, (mod) => {
    embedMapboxFrameworks(mod.modResults);
    return mod;
  });
};
module.exports.embedMapboxFrameworks = embedMapboxFrameworks;
