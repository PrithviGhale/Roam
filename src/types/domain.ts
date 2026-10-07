export interface Coordinate {
  latitude: number;
  longitude: number;
}
export type RouteProvider = "mapbox" | "google" | "fallback";
export type PlaceCategory = "food" | "gas" | "restroom" | "coffee" | "parking";
export interface Place {
  id: string;
  name: string;
  subtitle: string;
  category: PlaceCategory | "destination";
  coordinate: Coordinate;
  source: "mock" | "verified";
  address?: string;
  rating?: number;
  ratingCount?: number;
  openNow?: boolean;
  businessStatus?: string;
  primaryType?: string;
  distanceMeters?: number;
  routeOffsetMeters?: number;
  aheadMeters?: number;
  verifiedDetour?: VerifiedDetour;
  attributions?: { provider: string; uri?: string }[];
}
export interface VerifiedDetour {
  durationSeconds: number;
  distanceMeters: number;
  baselineDurationSeconds: number;
  baselineDistanceMeters: number;
  candidateDurationSeconds: number;
  candidateDistanceMeters: number;
  calculatedAt: string;
  insertionIndex: number;
  source: "google-routes-comparison" | "mapbox-routes-comparison";
  provider?: RouteProvider;
}
export interface PlaceSuggestion {
  id: string;
  name: string;
  subtitle: string;
  source: "mock" | "verified";
  demoPlace?: Place;
}
export interface RequestOptions {
  signal?: AbortSignal;
  sessionToken?: string;
  requiredProvider?: RouteProvider;
}
export interface RouteLeg {
  distanceMeters: number;
  durationSeconds: number;
  start: Coordinate;
  end: Coordinate;
}
export interface Route {
  id: string;
  destination: Place;
  geometry: Coordinate[];
  distanceMeters: number;
  durationSeconds: number;
  source: "verified";
  provider?: RouteProvider;
  origin: Coordinate;
  end: Coordinate;
  legs: RouteLeg[];
  calculatedAt: string;
  bounds?: { low: Coordinate; high: Coordinate };
}
export interface TripStop {
  id: string;
  place: Place;
  visited?: boolean;
}
export interface ActiveTrip {
  destination: Place;
  route: Route | null;
  stops: TripStop[];
  startedAt?: string;
  completedBeforeRouteMeters?: number;
}
export interface TripState {
  navigation?: import("../services/navigation/NavigationController").NavigationState;
  trip: ActiveTrip | null;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  progress?: {
    projection: import("../utils/geo").RouteProjection;
    timestamp: number;
    route: Route;
  } | null;
  tracking?: {
    state: "onRoute" | "possiblyOffRoute" | "rerouting";
    error?: string;
  };
}
export interface Weather {
  temperatureCelsius: number;
  description: string;
  observedAt: string;
}
export type VoiceState =
  | "idle"
  | "listening"
  | "transcribing"
  | "thinking"
  | "usingTool"
  | "speaking"
  | "error";
export interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  category?: PlaceCategory;
  places?: Place[];
  spokenText?: string;
  error?: boolean;
}
export interface RoamContext {
  location: Coordinate | null;
  destination: Place | null;
  activeRoute: Route | null;
  speedMph: number | null;
  time: string;
  weather: Weather | null;
  previousConversation: Message[];
  placesMode?: "demo" | "google";
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
  mode: "demo" | "google";
  search(
    query: string,
    origin: Coordinate | null,
    options?: RequestOptions,
  ): Promise<Place[]>;
  autocomplete(
    query: string,
    origin: Coordinate | null,
    options?: RequestOptions,
  ): Promise<PlaceSuggestion[]>;
  getDetails(
    suggestion: PlaceSuggestion,
    options?: RequestOptions,
  ): Promise<Place>;
  nearby(
    category: PlaceCategory,
    origin: Coordinate | null,
    options?: RequestOptions,
  ): Promise<Place[]>;
  alongRoute(
    category: PlaceCategory,
    origin: Coordinate,
    route: Route,
    options?: RequestOptions,
  ): Promise<Place[]>;
}
export interface RoutesService {
  getRoute(
    origin: Coordinate,
    destination: Place,
    stops?: TripStop[],
    options?: RequestOptions,
  ): Promise<Route>;
}
export interface WeatherService {
  getWeather(location: Coordinate): Promise<Weather>;
}
