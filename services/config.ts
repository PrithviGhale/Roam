// Expo only inlines public variables referenced with static dot notation.
export const roamAccessToken =
  process.env.EXPO_PUBLIC_ROAM_ACCESS_TOKEN?.trim() ?? "";
export const googleConfiguration = {
  // V0.4 Places/Routes REST requests require the Worker. Native SDK keys stay separate.
  apiKey: "",
  proxyUrl:
    process.env.EXPO_PUBLIC_ROAM_API_URL?.trim().replace(/\/$/, "") ?? "",
  iosBundleIdentifier:
    process.env.EXPO_PUBLIC_GOOGLE_IOS_BUNDLE_IDENTIFIER?.trim() ||
    "host.exp.Exponent",
};
export const hasGoogleServices = Boolean(googleConfiguration.proxyUrl);
