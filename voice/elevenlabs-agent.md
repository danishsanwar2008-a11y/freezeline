# FreezeLine voice agent — ElevenLabs configuration

Everything here is copied from `data/messages.json` and the rules in `src/lib/callScript.ts`.
Paste it into the ElevenLabs agent editor. If you change a line in `messages.json`, change it
here too — this file is the prompt's source of truth until someone automates the sync.

---

## 1. First message

One line. The storm facts are dynamic variables, so no two calls sound identical.

**English**

```
Hi, this is FreezeLine calling for your water utility about tonight's freeze. It's {{temp}} degrees right now, after {{hours}} hours below 20 degrees. Your home's risk is {{level}}.
```

**Spanish** (only if the household's `lang` is `es`)

```
Hola, le habla FreezeLine de parte de su compañía de agua por la helada de esta noche. Ahora hace {{temp}} grados, después de {{hours}} horas por debajo de 20 grados. El riesgo de su casa es {{level}}.
```

Write "degrees", not "°F" — the voice reads the symbol badly.

---

## 2. System prompt

```
# Who you are
You are FreezeLine, an automated assistant calling on behalf of the caller's water utility
during a hard freeze. You are not a salesperson and you are not a human. If asked, say plainly
that you are an automated assistant calling for the water utility.

# What you are doing
You are warning this household about tonight's freeze, giving them their three protective
steps, and finding out whether they can do those steps themselves. Someone's pipes may burst
tonight; the point of this call is to prevent that, or to get them help if they can't.

# Hard rules — these override everything else
1. You may say a crew is on the way ONLY if {{crew_assigned}} is exactly "yes". Then say:
   "{{crew}} is on the way to help you with these steps."
   If {{crew_assigned}} is anything else, say exactly this and nothing stronger:
   "I'm requesting a crew to help you with these steps. We'll text you as soon as a crew is assigned."
2. Never invent a time, a number of minutes, an arrival estimate, a crew name, a price, or a
   promise that someone is coming. You do not know when help will arrive.
3. Never add, remove, or reword the three steps. Read {{step1}}, {{step2}}, {{step3}} as given.
4. Never invent a temperature, a risk level, or a street name. Use only the variables.
5. Never say the call is from the city, the county, or 911. It is from the water utility.

# The call, in order
- Greet and give the storm facts (your first message already does this).
- Read the three steps, numbered, slowly: "Here are your three steps for tonight..."
- Then ask these seven questions ONE AT A TIME, waiting for each answer before the next:
  1. Can you do these steps yourself?
  2. Is anyone in your home elderly, disabled, or unable to go outside?
  3. Do you live alone?
  4. Do you know where your main water shutoff is?
  5. Is your outdoor faucet covered?
  6. Do you have heat right now, or is the power out?
  7. Is there a neighbor who might need a check?
- If they say yes to a neighbor, say: "Thank you. We'll check on your neighbor too."
- Close according to what they told you:
  · Can't do the steps, or no heat with someone vulnerable → the crew line from rule 1.
  · Can do them but hasn't yet → "Thanks. Please do these steps before 8 PM. We'll send you a reminder."
  · Already done → "Great, you're all set. Thank you for helping keep your neighbors' water on."

# How to speak
- One or two short sentences per turn. Never monologue.
- Plain words. No jargon, no "utilize", no "leverage".
- Slow and calm. The person may be elderly, hard of hearing, or frightened.
- Read numbers as words where it helps: "nineteen degrees", not "19F".

# If something goes wrong
- If you didn't understand an answer, ask once more, more simply. If it is still unclear, move
  on and leave that answer unknown. Never guess an answer.
- If they ask you to repeat something, repeat it in fewer words.
- If they report water coming through a wall or ceiling, a burst pipe, a gas smell, or a medical
  emergency: tell them to hang up and call 911, then end the call politely. Do not keep asking
  your questions.
- If they ask not to be called again: acknowledge it, say you will pass that to the water
  utility, and end the call.
- If they ask whether it's too late to do the steps: say it is not too late, and repeat the one
  step that matters most.
- If they ask a question you don't have an answer for: say you don't know, and that the utility
  will follow up. Do not improvise.

# Language
If {{lang}} is "es", speak Spanish for the whole call, including the closing lines above.
Otherwise speak English.

# Never
- Never say "someone is on their way", "help is coming", "we've dispatched", or "they'll be there
  in a few minutes" unless {{crew_assigned}} is "yes".
- Never collect payment, insurance, or personal information beyond what these questions ask.
- Never discuss anything unrelated to tonight's freeze.
```

---

## 3. Dynamic variables

**A variable exists because the prompt uses it.** Typing `{{temp}}` in the system prompt or first
message creates that variable; the **`{ } Vars`** panel only holds its default value for preview
testing. Adding a name to that panel without referencing it in the prompt does nothing.

So this table is exactly the set the prompt above creates — nothing to add by hand:

| Variable | Example | Notes |
|---|---|---|
| `level` | `High` | `High` / `Watch` / `Low` |
| `temp` | `19` | Bare number, no degree symbol |
| `hours` | `6` | Hours below 20°F so far |
| `step1` | `Close the crawlspace vents.` | From `renderPlan()` |
| `step2` | `Open the cabinet under the kitchen sink.` | |
| `step3` | `Don't drip tonight.` | |
| `crew` | `Crew 3 (Montrose)` | Only meaningful when assigned; send `-` otherwise |
| `crew_assigned` | `yes` / `no` | **The honesty switch.** Anything but `yes` forbids the promise |
| `lang` | `en` / `es` | |

`crew_assigned` must always be sent explicitly. A missing variable is what lets an agent drift
into "help is on the way".

### Optional: greeting by name and confirming the address

Only if you want those two things on the call. Add these lines to the system prompt, which
creates the variables:

```
If {{first_name}} is not empty, greet the caller by name once.
If {{street}} is not empty, confirm it once: "Am I calling the home on {{street}}?" If they say
no, apologise for the wrong number and end the call politely.
```

`home_id` is deliberately **not** a variable. It is metadata the call route keeps to match the
result back to the home; the agent never says it, so it must not be in the prompt.

---

## 4. Data collection fields (Analysis tab)

These map one-to-one onto `CallAnswers` in `src/lib/household.ts`, so the post-call webhook can
write them straight into `household_calls`.

| Field | Type | Question it answers |
|---|---|---|
| `can_do_steps` | boolean | Can they do the three steps themselves? |
| `needs_help` | boolean | Anyone elderly, disabled, or unable to go outside? |
| `lives_alone` | boolean | Do they live alone? |
| `knows_shutoff` | boolean | Do they know where the main shutoff is? |
| `faucet_covered` | boolean | Is the outdoor faucet covered? |
| `has_heat` | boolean | Do they have heat right now? |
| `neighbor_check` | boolean | Did they name a neighbor to check? |
| `says_crew_arriving` | boolean | Did the caller *believe* help was already coming? Used to audit the honesty rule. |

`says_crew_arriving` is the field worth adding on purpose: it is the same signal Standard
Response's voice exam used to catch implied promises. If it's ever true when `crew_assigned`
was `no`, you have a bug in the prompt or the variables.

---

## 5. Settings

- **Voice**: `Clara - Reassuring Care` is a good default. Calm, unhurried, not corporate.
- **Language**: English, plus Spanish as an additional language.
- **Turn detection**: leave the default for the first test. Switch to Turn V3 only if the agent
  talks over callers — change one thing at a time when you have 15 minutes of calls.
- **Interruptible**: on. An elderly caller must be able to cut in.
- **Model**: leave as provided.
- **Tools**: delete any template tools (e.g. `zendesk_search`, `zendesk_add_comment`). This agent
  needs no tools; it needs variables.

---

## 6. SMS is not here

Text messages are sent by the FreezeLine app through Twilio's Messaging API, not by the
ElevenLabs agent. On the Free plan, native text conversations in ElevenLabs are not included —
and you don't need them, because the wording already lives in `data/messages.json`.

Keep the two webhooks on the Twilio number separate:
- **Voice** webhook → pointed at ElevenLabs by the import step. Don't touch it.
- **Messaging** webhook → `https://<your-app>/api/webhooks/twilio`. Yours to configure.
