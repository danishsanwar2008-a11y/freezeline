// Fixed homeowner-page wording in English and Spanish. The plan itself (headline, steps,
// reasons) is written and translated by Claude; these are the labels around it.

import type { ExposedPipe, ReasonSource } from "./steps";

export type Lang = "en" | "es";
export const isLang = (v: unknown): v is Lang => v === "en" || v === "es";

const DAYS = { en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], es: ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"] };
const MONTHS = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  es: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"],
};

function parts(time: string) {
  const [date, clock] = time.split("T");
  const [y, m, d] = date.split("-").map(Number);
  return { y, m, d, hour: Number(clock.slice(0, 2)) };
}

/** "3 AM" / "3 a. m." */
export function clockLabel(time: string, lang: Lang) {
  const { hour } = parts(time);
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return lang === "es" ? `${h} ${hour < 12 ? "a. m." : "p. m."}` : `${h} ${hour < 12 ? "AM" : "PM"}`;
}

/** "Tue, Feb 16" / "mar 16 feb" */
export function dayLabel(time: string, lang: Lang) {
  const { y, m, d } = parts(time);
  const dow = DAYS[lang][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return lang === "es" ? `${dow} ${d} ${MONTHS.es[m - 1]}` : `${dow}, ${MONTHS.en[m - 1]} ${d}`;
}

export const T = {
  en: {
    simulated: "Simulated demo",
    replayAt: "Replay",
    stepsTitle: "Your 3 steps before 8 PM",
    clockTitle: "Freeze clock",
    clockAtRisk: (t: string) => `If the heat goes out, your pipes are at risk around ${t}.`,
    clockSafe: (d: string) => `Even without heat, your pipes should be OK through ${d}.`,
    burstButton: "A pipe burst",
    burstTitle: "Shut off your water now",
    burstSteps: [
      "Turn off the main water valve. It is usually where the water line enters your house, or in the meter box near the street. Turn it clockwise until it stops.",
      "Turn off your water heater: gas to “pilot”, or switch off its breaker if it is electric.",
      "Open your faucets to drain the pipes and take pressure off the break.",
      "If it is safe, turn off electricity to wet areas and move valuables away from the water.",
      "Call a licensed plumber. To report a break in the street, call 311.",
    ],
    burstClose: "Close",
    photoTitle: "Check your outdoor faucet",
    photoPrompt: "Send a photo of your outdoor faucet. We'll tell you if it's covered.",
    photoButton: "Take or choose a photo",
    photoChecking: "Checking your photo…",
    photoResult: {
      covered: "Covered. Nice work. Your plan is updated.",
      bare: "Uncovered. Covering it is now your first step.",
      unclear: "We couldn't tell. Try again close up, in good light.",
    },
    photoPrivacy: "We don't keep your photo, only the result.",
    photoUnavailable: "The photo check isn't available right now.",
    why: "Why?",
    sources: {
      "Property record": "Property record",
      Forecast: "Forecast",
      "Photo: not sent yet": "Photo: not sent yet",
      "Photo: confirmed": "Photo: confirmed",
      "Photo: unclear": "Photo: unclear",
    } satisfies Record<ReasonSource, string>,
    pipes: { crawlspace: "Crawlspace", attic: "Attic", exterior_wall: "Outside wall", outdoor_faucet: "Outdoor faucet" } satisfies Record<ExposedPipe, string>,
    diagramExposed: "Highlighted: the pipes most exposed to cold.",
    diagramSafe: "Your pipes run through heated space.",
    noTranslation: "Automatic translation is unavailable right now, so your plan is shown in English.",
    footer: "Simulated home in a demo replay of Winter Storm Uri (Feb 2021). Not a real address.",
    notFound: "We couldn't find this home.",
  },
  es: {
    simulated: "Demostración simulada",
    replayAt: "Repetición",
    stepsTitle: "Sus 3 pasos antes de las 8 p. m.",
    clockTitle: "Reloj de congelación",
    clockAtRisk: (t: string) => `Si se va la calefacción, sus tuberías corren riesgo alrededor de las ${t}${t.endsWith(".") ? "" : "."}`,
    clockSafe: (d: string) => `Aun sin calefacción, sus tuberías deberían estar bien hasta el ${d}.`,
    burstButton: "Se reventó una tubería",
    burstTitle: "Cierre el agua ahora",
    burstSteps: [
      "Cierre la llave de paso principal. Suele estar donde la tubería entra a la casa o en la caja del medidor cerca de la calle. Gírela en el sentido de las agujas del reloj hasta que se detenga.",
      "Apague el calentador de agua: el de gas en “piloto”, o baje su interruptor si es eléctrico.",
      "Abra las llaves para vaciar las tuberías y quitar presión a la rotura.",
      "Si es seguro, corte la electricidad en las zonas mojadas y aleje sus objetos de valor del agua.",
      "Llame a un plomero con licencia. Para reportar una rotura en la calle, llame al 311.",
    ],
    burstClose: "Cerrar",
    photoTitle: "Revise su llave exterior",
    photoPrompt: "Envíe una foto de su llave de agua exterior. Le diremos si está cubierta.",
    photoButton: "Tomar o elegir una foto",
    photoChecking: "Revisando su foto…",
    photoResult: {
      covered: "Cubierta. Muy bien. Su plan está actualizado.",
      bare: "Sin cubrir. Cubrirla es ahora su primer paso.",
      unclear: "No pudimos verla bien. Intente de nuevo de cerca y con buena luz.",
    },
    photoPrivacy: "No guardamos su foto, solo el resultado.",
    photoUnavailable: "La revisión de fotos no está disponible ahora.",
    why: "¿Por qué?",
    sources: {
      "Property record": "Registro de la propiedad",
      Forecast: "Pronóstico",
      "Photo: not sent yet": "Foto: aún no enviada",
      "Photo: confirmed": "Foto: confirmado",
      "Photo: unclear": "Foto: no clara",
    } satisfies Record<ReasonSource, string>,
    pipes: { crawlspace: "Espacio bajo el piso", attic: "Ático", exterior_wall: "Pared exterior", outdoor_faucet: "Llave exterior" } satisfies Record<ExposedPipe, string>,
    diagramExposed: "Resaltado: las tuberías más expuestas al frío.",
    diagramSafe: "Sus tuberías pasan por espacios con calefacción.",
    noTranslation: "La traducción automática no está disponible ahora, así que su plan se muestra en inglés.",
    footer: "Casa simulada en una repetición de demostración de la tormenta invernal Uri (feb. 2021). No es una dirección real.",
    notFound: "No encontramos esta casa.",
  },
} as const;
