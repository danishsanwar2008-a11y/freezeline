// "1 home", "2 homes", "1,204 homes". One helper so no screen ever says "1 homes".

/** Count + noun with the right plural ("1 home", "3 homes"). Numbers use thousands separators. */
export function plural(n: number, one: string, many: string = `${one}s`): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

/** English verb that agrees with a count: verb(1, "needs", "need") -> "needs". */
export const verb = (n: number, one: string, many: string) => (n === 1 ? one : many);

// Pre-written templates say "{n} homes" / "{n} casas". When the count is exactly 1, use the singular noun.
// Only nouns are changed (the message wording itself stays as written in data/messages.json).
const SINGULAR: Record<string, string> = {
  homes: "home",
  hours: "hour",
  crews: "crew",
  calls: "call",
  texts: "text",
  areas: "area",
  casas: "casa",
  horas: "hora",
  llamadas: "llamada",
  zonas: "zona",
};
const ONE_PLURAL = new RegExp(`(^|[^\\d.,])1 (${Object.keys(SINGULAR).join("|")})\\b`, "g");

export function singularizeOnes(text: string): string {
  return text.replace(ONE_PLURAL, (_, pre: string, noun: string) => `${pre}1 ${SINGULAR[noun]}`);
}
