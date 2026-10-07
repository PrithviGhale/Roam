const { withInfoPlist } = require("expo/config-plugins");
module.exports = function withRoamNavigation(config) {
  return withInfoPlist(config, (config) => {
    config.modResults.ROAMGoogleMapsKey =
      process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY?.trim() || "";
    // Explicit Cloud project/commercial eligibility opt-in; no account setup is assumed.
    config.modResults.ROAMNavigationEnabled =
      process.env.ROAM_ENABLE_NAVIGATION === "true";
    return config;
  });
};
