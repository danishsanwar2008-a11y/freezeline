// Verifies data/messages.json covers every fact combination in English and Spanish:
// homeowner plans, SMS, agent explanations, the agent's call with a household, and storm-day sentences.
// Usage: npm run messages:check
import { checkCoverage } from "../src/lib/pregenerated";
import { checkConversationCoverage } from "../src/lib/callCoverage";

const c = checkCoverage();
const v = checkConversationCoverage();
console.log(`Message variants written: ${c.variants + v.variants} (English + Spanish)`);
console.log(
  `Plan combinations: ${c.planCombinations} · SMS: ${c.smsCombinations} · call conversations: ${v.conversations} · storm days: ${v.stormDays} · renders checked: ${c.renders + v.renders}`,
);
if (c.unused.length) console.log(`Unused entries: ${c.unused.join(", ")}`);
const errors = [...c.errors, ...v.errors];
if (errors.length) {
  console.error(`\n${errors.length} problem(s):`);
  for (const e of errors.slice(0, 30)) console.error(` - ${e}`);
  process.exit(1);
}
console.log("All combinations covered.");
