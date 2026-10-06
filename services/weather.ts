import type { WeatherService } from "../types/domain";

export const weatherService: WeatherService = {
  async getWeather() {
    throw new Error("Live weather is not connected yet.");
  },
};
