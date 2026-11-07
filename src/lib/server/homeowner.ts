import "server-only";
import uriNeighborhoods from "../../../data/uri-2021-neighborhoods.json";
import { buildReplay, homeContext, zoneExposures, type ConsoleHome, type ReplayModel } from "@/lib/replay";
import { planCity, type HomePlan } from "@/lib/planner";
import { buildPlanCard, displayLevel, type FaucetPhoto, type PlanCard } from "@/lib/steps";
import { freezeClock, type FreezeClock } from "@/lib/freezeClock";
import { fetchLiveForecast, type WeatherHour, type WeatherSeries } from "@/lib/weather";
import { houstonNowHour } from "@/components/console/format";
import type { Lang } from "@/lib/i18n";
import { getCity, hourIndex, toTimestamp, URI_HOURS, type City } from "./cityState";
import { getSupabaseAdmin } from "./supabaseAdmin";
import { friendlyPlan, type FriendlyPlan } from "./writer";

const ZONE_SERIES = (uriNeighborhoods as unknown as { zones: Record<string, WeatherSeries> }).zones;

let live: { at: number; model: Promise<ReplayModel> } | null = null;
/** Live forecast model, refreshed every 30 minutes. */
function liveModel(city: City): Promise<ReplayModel> {
  if (!live || Date.now() - live.at > 30 * 60 * 1000) {
    live = { at: Date.now(), model: fetchLiveForecast(7).then((s) => buildReplay(city.homes, s.hours)) };
    live.model.catch(() => (live = null));
  }
  return live.model;
}

export async function getPhotoResult(homeId: string): Promise<FaucetPhoto | undefined> {
  const db = getSupabaseAdmin();
  if (!db) return undefined;
  const { data, error } = await db.from("photo_checks").select("outdoor_faucet").eq("home_id", homeId).maybeSingle();
  if (error || !data) return undefined;
  return data.outdoor_faucet as FaucetPhoto;
}

/** If the agent published a plan for this hour, it wins (so the page matches the text message). */
async function publishedAction(homeId: string, time: string): Promise<{ action: string; faucet: string | null } | undefined> {
  const db = getSupabaseAdmin();
  if (!db) return undefined;
  const { data, error } = await db.from("drip_plans").select("action,faucet").eq("home_id", homeId).eq("plan_for", toTimestamp(time)).maybeSingle();
  if (error || !data) return undefined;
  return data;
}

export interface HomeownerView {
  home: ConsoleHome;
  time: string;
  isReplay: boolean;
  card: PlanCard;
  friendly: FriendlyPlan;
  clock: FreezeClock;
  photo?: FaucetPhoto;
}

export async function loadHomeownerView(homeId: string, t: string | undefined, lang: Lang): Promise<HomeownerView | null> {
  const city = await getCity();
  const idx = city.byId.get(homeId);
  if (idx === undefined) return null;
  const home = city.homes[idx];

  const replayHour = t ? hourIndex(t) : -1;
  const isReplay = replayHour >= 0;
  const model = isReplay ? city.model : await liveModel(city);
  const hour = isReplay ? replayHour : Math.max(0, model.hours.findIndex((h) => h.time >= houstonNowHour()));
  const time = model.hours[hour].time;

  const plan = planCity(city.zones, city.homes, model.vuln, zoneExposures(model, hour));
  let homePlan: HomePlan = plan.homes[idx];
  const [published, photo] = await Promise.all([isReplay ? publishedAction(homeId, time) : undefined, getPhotoResult(homeId)]);
  if (published && homePlan.level !== "Low") {
    const drip = published.action === "drip";
    homePlan = { ...homePlan, action: drip ? "drip" : "no_drip", faucet: drip ? published.faucet : null, uncovered: !drip && homePlan.level === "High" };
  }

  const card = buildPlanCard(home, homePlan, homeContext(model, home, hour), photo);
  const friendly = await friendlyPlan(card, lang);
  const series: WeatherHour[] = isReplay ? (ZONE_SERIES[home.zone_id]?.hours ?? URI_HOURS) : model.hours;
  const clock = freezeClock(series, hour, displayLevel(homePlan.level));
  return { home, time, isReplay, card, friendly, clock, photo };
}
