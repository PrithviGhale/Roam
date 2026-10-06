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
      text: "Live road and weather data are not connected yet. I won’t guess at conditions. For now, I can help you explore the demo places.",
    };
  if (
    /\b(toll|avoid|scenic|route|navigate|direction)\b/i.test(message) &&
    !intents.some((intent) => intent.pattern.test(message))
  )
    return {
      text: "Route planning is coming next. This version can preview a destination, but it doesn’t calculate routes or give driving directions yet.",
    };
  const intent = intents.find((item) => item.pattern.test(message));
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
