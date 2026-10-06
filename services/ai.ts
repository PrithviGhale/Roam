import type {
  AIService,
  AssistantReply,
  PlaceCategory,
  RoamContext,
} from "../types/domain";

const intents: { pattern: RegExp; category: PlaceCategory }[] = [
  {
    pattern: /\b(restroom|bathroom|toilet|rest stop)\b/i,
    category: "restroom",
  },
  { pattern: /\b(gas|fuel|petrol)\b/i, category: "gas" },
  { pattern: /\b(coffee|cafe|café|starbucks)\b/i, category: "coffee" },
  { pattern: /\b(park|parking|garage)\b/i, category: "parking" },
  {
    pattern: /\b(food|hungry|eat|restaurant|lunch|dinner|breakfast)\b/i,
    category: "food",
  },
];
export function mockReply(
  message: string,
  context: RoamContext,
): AssistantReply {
  if (/\b(weather|rain|temperature|traffic|police|hazard)\b/i.test(message))
    return {
      text:
        context.placesMode === "google"
          ? "I can’t report live weather, hazards, or traffic conditions in this simulated conversation. The trip card shows Google’s driving estimate when a route is calculated; use Refresh route for a new estimate."
          : "Live road and weather data are not connected yet. I won’t guess at conditions. For now, I can help you explore the demo places.",
    };
  if (
    /\b(toll|avoid|scenic|route|navigate|direction)\b/i.test(message) &&
    !intents.some((intent) => intent.pattern.test(message))
  )
    return {
      text:
        context.placesMode === "google"
          ? "Use destination search to plan a Google driving route, then Start Trip in the trip card. I can’t change route preferences or navigate by voice in this simulated conversation. Turn-by-turn guidance is not implemented."
          : "Route planning is coming next. This version can preview a destination, but it doesn’t calculate routes or give driving directions yet.",
    };
  const intent = intents.find((item) => item.pattern.test(message));
  if (intent && context.placesMode === "google")
    return {
      text: `I can open ${intent.category} search${context.activeRoute ? " along your current route" : " near your location"}. The search sheet uses Google Places. I’m still a simulated assistant; choose a result there to route to it or add a stop.`,
      category: intent.category,
    };
  if (context.placesMode === "google")
    return {
      text: "Destination search and the trip controls now use Google Places and Routes. This conversation is still simulated, so I can’t change your trip by voice. Try a food, gas, coffee, restroom, or parking prompt to open search.",
    };
  if (intent)
    return {
      text: `Let’s find a ${intent.category === "food" ? "bite to eat" : intent.category === "gas" ? "fuel stop" : intent.category === "restroom" ? "restroom" : intent.category === "coffee" ? "coffee break" : "place to park"}. I can show you a few demo ideas${context.destination ? " for your next stop" : ""}. These are sample places, not live recommendations.`,
      category: intent.category,
    };
  if (/\b(add|stop|remove)\b/i.test(message))
    return {
      text: "I can preview a place on the map. Adding or removing stops will be available when verified routing is connected.",
    };
  return {
    text: "I’m your co-pilot for the road. Try “I’m hungry,” “I need gas,” or “Find coffee.” In this prototype I use demo places; live AI and navigation are coming next.",
  };
}
export const aiService: AIService = {
  async sendMessage(message, context) {
    return mockReply(message, context);
  },
};
export const sendMessageToRoam = (message: string, context: RoamContext) =>
  aiService.sendMessage(message, context);
