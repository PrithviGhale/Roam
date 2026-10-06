export interface Coordinate {
  latitude: number;
  longitude: number;
}
export type PlaceCategory = "food" | "gas" | "restroom" | "coffee" | "parking";
export interface Place {
  id: string;
  name: string;
  subtitle: string;
  category: PlaceCategory;
  coordinate: Coordinate;
  source: "mock" | "verified";
}
export interface Route {
  id: string;
  destination: Place;
  geometry: Coordinate[];
  distanceMeters: number;
  durationSeconds: number;
  source: "verified";
}
export interface Weather {
  temperatureCelsius: number;
  description: string;
  observedAt: string;
}
export type VoiceState = "idle" | "listening" | "processing" | "speaking";
export interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  category?: PlaceCategory;
}
export interface RoamContext {
  location: Coordinate | null;
  destination: Place | null;
  activeRoute: Route | null;
  speedMph: number | null;
  time: string;
  weather: Weather | null;
  previousConversation: Message[];
}
export type RoamToolName =
  | "searchPlaces"
  | "getRoute"
  | "addStop"
  | "removeStop"
  | "getWeather"
  | "getTraffic"
  | "findGas"
  | "findFood"
  | "findParking"
  | "findRestroom";
export interface AssistantReply {
  text: string;
  category?: PlaceCategory;
}
export interface AIService {
  sendMessage(message: string, context: RoamContext): Promise<AssistantReply>;
}
export interface PlacesService {
  search(query: string, origin: Coordinate | null): Promise<Place[]>;
  nearby(category: PlaceCategory, origin: Coordinate | null): Promise<Place[]>;
}
export interface RoutesService {
  getRoute(origin: Coordinate, destination: Place): Promise<Route>;
}
export interface WeatherService {
  getWeather(location: Coordinate): Promise<Weather>;
}
