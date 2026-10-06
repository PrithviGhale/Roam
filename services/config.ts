// Expo only inlines public variables referenced with static dot notation.
export const googleConfiguration = {
  apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ?? "",
  proxyUrl:
    process.env.EXPO_PUBLIC_ROAM_API_URL?.trim().replace(/\/$/, "") ?? "",
  iosBundleIdentifier:
    process.env.EXPO_PUBLIC_GOOGLE_IOS_BUNDLE_IDENTIFIER?.trim() ||
    "host.exp.Exponent",
};
export const hasGoogleServices = Boolean(
  googleConfiguration.apiKey || googleConfiguration.proxyUrl,
);
