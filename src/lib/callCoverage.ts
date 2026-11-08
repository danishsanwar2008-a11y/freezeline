// Coverage for the call script and storm sentences (see scripts/check-messages.ts).
import { MESSAGES, LANGS } from "./pregenerated";
import { buildConversation, stormSentence } from "./callScript";
import { assess, type CallAnswers, type HomeOutreach } from "./household";
import type { DisplayLevel } from "./steps";

const SLOT = /\{(\w+)\}/;

export function checkConversationCoverage() {
  const errors: string[] = [];
  let conversations = 0, renders = 0, stormDays = 0;
  const bools = [false, true];
  for (const can_do_steps of bools)
    for (const did_steps of can_do_steps ? bools : [false])
      for (const someone_elderly of bools)
        for (const someone_disabled of bools)
          for (const cant_go_outside of bools)
            for (const lives_alone of bools)
              for (const knows_shutoff of bools)
                for (const faucet_covered of [null, false, true])
                  for (const has_heat of bools)
                    for (const neighbor_check of [null, "x"])
                      for (const crew of [null, "Crew 2"])
                        for (const replied_text of bools)
                          for (const hours of [0, 19]) {
                            conversations++;
                            const answers: CallAnswers = { can_do_steps, did_steps, someone_elderly, someone_disabled, cant_go_outside, lives_alone, knows_shutoff, faucet_covered, has_heat, neighbor_check };
                            const contact = { replied_text, called: !replied_text, answered_call: !replied_text, door_check: false };
                            const o: HomeOutreach = { contact: replied_text ? "texted" : "called", ...contact, answers, flagged_by: null };
                            const level: DisplayLevel = "High";
                            for (const lang of LANGS) {
                              const where = `call ${JSON.stringify({ can_do_steps, someone_elderly, faucet_covered, has_heat, crew, replied_text })}/${lang}`;
                              try {
                                const c = buildConversation({ lang, level, temp: 14, hoursBelow20: hours, steps: ["A.", "B.", "C."], hasOutdoorFaucet: faucet_covered !== null, contact, answers, assessment: assess(o).assessment, assignedCrew: crew });
                                renders++;
                                for (const l of c.lines) if (!l.text.trim() || SLOT.test(l.text)) errors.push(`${where}: "${l.text}"`);
                                const said = c.lines.map((l) => l.text).join(" ");
                                if (!crew && /on the way|va en camino/i.test(said)) errors.push(`${where}: says a crew is on the way without an assignment`);
                              } catch (e) {
                                errors.push(`${where}: ${(e as Error).message}`);
                              }
                            }
                          }
  for (const contact of [null, { replied_text: false, called: false, answered_call: false, door_check: false }, { replied_text: false, called: true, answered_call: false, door_check: true }])
    for (const lang of LANGS) {
      const c = buildConversation({ lang, level: "Watch", temp: 20, hoursBelow20: 3, steps: [], hasOutdoorFaucet: true, contact, answers: null, assessment: null, assignedCrew: null });
      renders++;
      if (!c.note || SLOT.test(c.note)) errors.push(`status note missing for ${JSON.stringify(contact)}/${lang}`);
    }
  for (const kind of ["coldest", "freezing", "calm"] as const)
    for (const lang of LANGS) {
      stormDays++;
      renders++;
      const s = stormSentence(kind, lang, { day: "Monday", temp: 14, n: 338 });
      if (SLOT.test(s)) errors.push(`storm ${kind}/${lang}: unfilled slot`);
    }
  const P = MESSAGES as unknown as { call: object; storm: object };
  const variants = (Object.keys(P.call).length + Object.keys(P.storm).length) * LANGS.length;
  return { conversations, stormDays, renders, variants, errors };
}
