// Open-Meteo weather for Houston: historical archive (Uri replay) + live forecast (later phases).

export const HOUSTON = { latitude: 29.7604, longitude: -95.3698 };
const HOURLY = "temperature_2m,apparent_temperature,wind_speed_10m";
const COMMON = {
  hourly: HOURLY,
  temperature_unit: "fahrenheit",
  wind_speed_unit: "mph",
  timezone: "America/Chicago",
};

export interface WeatherHour {
  time: string; // local America/Chicago, e.g. "2021-02-15T06:00"
  temperature_f: number;
  apparent_temperature_f: number;
  wind_speed_mph: number;
}

export interface WeatherSeries {
  source: "open-meteo-archive" | "open-meteo-forecast";
  location: { latitude: number; longitude: number; timezone: string };
  units: { temperature: "°F"; wind_speed: "mph" };
  hours: WeatherHour[];
}

interface OpenMeteoResponse {
  latitude: number;
  longitude: number;
  timezone: string;
  hourly: {
    time: string[];
    temperature_2m: number[];
    apparent_temperature: number[];
    wind_speed_10m: number[];
  };
}

export function parseOpenMeteo(
  json: OpenMeteoResponse,
  source: WeatherSeries["source"],
): WeatherSeries {
  const h = json.hourly;
  return {
    source,
    location: { latitude: json.latitude, longitude: json.longitude, timezone: json.timezone },
    units: { temperature: "°F", wind_speed: "mph" },
    hours: h.time.map((time, i) => ({
      time,
      temperature_f: h.temperature_2m[i],
      apparent_temperature_f: h.apparent_temperature[i],
      wind_speed_mph: h.wind_speed_10m[i],
    })),
  };
}

async function get(url: string): Promise<OpenMeteoResponse> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}: ${await res.text()}`);
  return res.json();
}

/** Hourly Houston weather from the Open-Meteo archive. Dates are YYYY-MM-DD (inclusive). */
export async function fetchArchiveWeather(startDate: string, endDate: string): Promise<WeatherSeries> {
  const params = new URLSearchParams({
    latitude: String(HOUSTON.latitude),
    longitude: String(HOUSTON.longitude),
    start_date: startDate,
    end_date: endDate,
    ...COMMON,
  });
  const json = await get(`https://archive-api.open-meteo.com/v1/archive?${params}`);
  return parseOpenMeteo(json, "open-meteo-archive");
}

/** Winter Storm Uri window: Feb 13–19, 2021. */
export function fetchUriWeather() {
  return fetchArchiveWeather("2021-02-13", "2021-02-19");
}

/** Live hourly forecast for Houston, same shape as the archive (for later phases). */
export async function fetchLiveForecast(days = 7): Promise<WeatherSeries> {
  const params = new URLSearchParams({
    latitude: String(HOUSTON.latitude),
    longitude: String(HOUSTON.longitude),
    forecast_days: String(days),
    ...COMMON,
  });
  const json = await get(`https://api.open-meteo.com/v1/forecast?${params}`);
  return parseOpenMeteo(json, "open-meteo-forecast");
}
