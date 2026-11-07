// Verifies data/messages.json covers every fact combination in English and Spanish.
// Usage: npm run messages:check
import { checkCoverage } from "../src/lib/pregenerated";

const c = checkCoverage();
console.log(`Message variants written: ${c.variants} (English + Spanish)`);
console.log(`Plan fact combinations: ${c.planCombinations} · SMS combinations: ${c.smsCombinations} · renders checked: ${c.renders}`);
if (c.unused.length) console.log(`Unused entries: ${c.unused.join(", ")}`);
if (c.errors.length) {
  console.error(`\n${c.errors.length} problem(s):`);
  for (const e of c.errors.slice(0, 30)) console.error(` - ${e}`);
  process.exit(1);
}
console.log("All combinations covered.");
