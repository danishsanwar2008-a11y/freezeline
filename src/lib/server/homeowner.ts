import "server-only";
import uriNeighborhoods from "../../../data/uri-2021-neighborhoods.json";
import { buildReplay, homeContext, zoneExposures, type ConsoleHome, type ReplayModel } from "@/lib/replay";
import { planCity, type HomePlan } from "@/lib/planner";
import { buildPlanCard, displayLevel, type ExposedPipe, type FaucetPhoto, type PlanCard } from "@/lib/steps";
import { freezeClock, type FreezeClock } from "@/lib/freezeClock";
import { fetchLiveForecast, type WeatherHour, type WeatherSeries } from "@/lib/weather";
import { houstonNowHour } from "@/components/console/format";
import { H, dayLabel, type Lang } from "@/lib/i18n";
import { answerTiles, buildConversation, stormSentence, type AnswerTiles, type Conversation } from "@/lib/callScript";
import type { CallAnswers } from "@/lib/household";
import { getCity, hourIndex, toTimestamp, URI_HOURS, type City } from "./cityState";
import { getSupabaseAdmin } from "./supabaseAdmin";
import { friendlyPlan, type FriendlyPlan } from "./writer";
import { photoCheckAvailable } from "./provider";
import { loadHomeRecord } from "./outreachState";
import { NEIGHBORHOODS } from "@/lib/seed/generate";

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

// ---------- Storm in your area (aggregated only: no other homes' details) ----------

export type Shade = "calm" | "watch" | "severe";
export interface StormDay {
  time: string; // coldest hour of the day
  label: string;
  low: number;
  high: number;
  sentence: string;
  /** Per-area shading for this day (area totals only). */
  areas: { zone_id: string; neighborhood: string; center: [number, number]; bbox: [number, number, number, number]; shade: Shade }[];
}

const shadeOf = (share: number): Shade => (share >= 0.5 ? "severe" : share >= 0.1 ? "watch" : "calm");
const stormCache = new Map<string, StormDay[]>();

function stormDays(city: City, model: ReplayModel, zoneId: string, lang: Lang, cacheKey: string): StormDay[] {
  const key = `${cacheKey}|${zoneId}|${lang}`;
  const hit = stormCache.get(key);
  if (hit) return hit;
  const series: WeatherHour[] = ZONE_SERIES[zoneId]?.hours ?? model.hours;
  const byDay = new Map<string, number[]>();
  model.hours.forEach((h, i) => {
    const d = h.time.slice(0, 10);
    (byDay.get(d) ?? byDay.set(d, []).get(d)!).push(i);
  });
  const days = [...byDay.values()].filter((idx) => idx.length >= 12);
  const lows = days.map((idx) => Math.min(...idx.map((i) => (series[i] ?? model.hours[i]).temperature_f)));
  const coldestLow = Math.min(...lows);

  const out = days.map((idx, k) => {
    const temps = idx.map((i) => (series[i] ?? model.hours[i]).temperature_f);
    const coldest = idx[temps.indexOf(Math.min(...temps))];
    const plan = planCity(city.zones, city.homes, model.vuln, zoneExposures(model, coldest));
    const need = new Map<string, { n: number; total: number }>();
    city.homes.forEach((h, i) => {
      const z = need.get(h.zone_id) ?? { n: 0, total: 0 };
      z.total++;
      if (plan.homes[i].level !== "Low") z.n++;
      need.set(h.zone_id, z);
    });
    const mine = need.get(zoneId) ?? { n: 0, total: 1 };
    const low = Math.round(lows[k]);
    const day = dayLabel(model.hours[coldest].time, lang).split(/,| /)[0];
    const kind = mine.n === 0 ? "calm" : lows[k] === coldestLow ? "coldest" : "freezing";
    return {
      time: model.hours[coldest].time,
      label: dayLabel(model.hours[coldest].time, lang),
      low,
      high: Math.round(Math.max(...temps)),
      sentence: stormSentence(kind, lang, { day, temp: low, n: mine.n.toLocaleString(lang === "es" ? "es-MX" : "en-US") }),
      areas: city.zones.map((z) => ({
        zone_id: z.id,
        neighborhood: z.neighborhood,
        center: [z.center_lng, z.center_lat] as [number, number],
        bbox: NEIGHBORHOODS.find((n) => n.id === z.id)?.bbox ?? [z.center_lat, z.center_lng, z.center_lat, z.center_lng],
        shade: shadeOf((need.get(z.id)?.n ?? 0) / Math.max(1, need.get(z.id)?.total ?? 1)),
      })),
    };
  });
  stormCache.set(key, out);
  return out;
}

// ---------- the view ----------

export interface HomeownerView {
  home: ConsoleHome;
  time: string;
  isReplay: boolean;
  card: PlanCard;
  friendly: FriendlyPlan;
  clock: FreezeClock;
  photo?: FaucetPhoto;
  /** At-risk sections confirmed by the photo check (drawn solid). */
  confirmedPipes: ExposedPipe[];
  /** True when LLM_PROVIDER + key can run the photo check. */
  photoEnabled: boolean;
  conversation: Conversation;
  tiles: AnswerTiles;
  /** Crew ACTUALLY assigned to this home (honesty rule), translated name; null otherwise. */
  crew: string | null;
  crewRequested: boolean;
  storm: StormDay[];
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
  const [published, photo, record] = await Promise.all([
    isReplay ? publishedAction(homeId, time) : undefined,
    getPhotoResult(homeId),
    isReplay ? loadHomeRecord(homeId, time) : Promise.resolve({ call: null, assignment: null, crewName: null }),
  ]);
  if (published && homePlan.level !== "Low") {
    const drip = published.action === "drip";
    homePlan = { ...homePlan, action: drip ? "drip" : "no_drip", faucet: drip ? published.faucet : null, uncovered: !drip && homePlan.level === "High" };
  }

  const weather = homeContext(model, home, hour);
  const card = buildPlanCard(home, homePlan, weather, photo);
  const friendly = await friendlyPlan(card, lang);
  const series: WeatherHour[] = isReplay ? (ZONE_SERIES[home.zone_id]?.hours ?? URI_HOURS) : model.hours;
  const clock = freezeClock(series, hour, displayLevel(homePlan.level));

  // The agent's call with this household (sample), built from saved facts only.
  const call = record.call;
  const answers = call?.answers && "can_do_steps" in call.answers ? (call.answers as CallAnswers) : null;
  const crew = record.assignment?.status === "assigned" && record.crewName ? H[lang].crewName(record.crewName) : null;
  const conversation = buildConversation({
    lang,
    level: card.level,
    temp: weather.temperature_f,
    hoursBelow20: weather.hoursBelow20,
    steps: friendly.steps.map((s) => s.text),
    hasOutdoorFaucet: home.outdoor_faucets > 0,
    contact: call
      ? {
          replied_text: !!call.answers.replied_text,
          called: call.contact === "called" || call.contact === "door",
          answered_call: !!call.answers.answered_call,
          door_check: !!call.answers.door_check,
        }
      : null,
    answers,
    assessment: call?.assessment ?? null,
    assignedCrew: crew,
  });

  return {
    home,
    time,
    isReplay,
    card,
    friendly,
    clock,
    photo,
    confirmedPipes: photo === "bare" ? ["outdoor_faucet"] : [],
    photoEnabled: photoCheckAvailable(),
    conversation,
    tiles: answerTiles(answers, call?.assessment ?? null),
    crew,
    crewRequested: call?.assessment === "needs_crew" && !crew,
    storm: stormDays(city, model, home.zone_id, lang, isReplay ? "uri" : `live-${model.hours[0].time}`),
  };
}
