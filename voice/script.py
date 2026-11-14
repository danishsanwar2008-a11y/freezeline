"""The agent's side of one call: the same 7 questions, the same pre-written lines, and the
same honesty rule as src/lib/callScript.ts - a crew is "on the way" only when a crew is
actually assigned, otherwise the agent says it is requesting one.

Everything the caller hears comes from data/messages.json. This module decides *which*
line to say and *when*, never the words. Pure standard library, so it runs and is checked
on a machine with no models, no audio device and no network.

  python voice/script.py --check      # verify every line exists in both languages
  python voice/script.py --demo       # type answers, see the whole conversation
  python voice/script.py --demo --lang es --level High --temp 19 --hours 6
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent

LANGS = ("en", "es")
ASSESSMENTS = ("ready", "needs_reminder", "needs_crew")

SLOT = re.compile(r"\{(\w+)\}")


def messages() -> dict:
    return json.loads((ROOT / "data" / "messages.json").read_text(encoding="utf-8"))


def fill(template: str, params: dict[str, object] | None = None) -> str:
    params = params or {}
    return SLOT.sub(lambda m: str(params[m.group(1)]) if m.group(1) in params else m.group(0), template)


def line(key: str, lang: str, params: dict[str, object] | None = None) -> str:
    """One pre-written line. Missing keys are a build error, not something to improvise."""
    text = messages()["call"].get(key, {}).get(lang)
    if text is None:
        raise KeyError(f'data/messages.json is missing call "{key}" ({lang})')
    return fill(text, params)


# ---------- yes / no ----------

def normalise(text: str) -> str:
    """Lowercase, strip accents, drop apostrophes, punctuation to spaces.

    Apostrophes go first, so "don't" becomes "dont" rather than "don t" - otherwise every
    contraction silently fails to match its negation and "I don't know" reads as a yes.
    """
    t = text.lower().replace("'", "").replace("\u2019", "")
    t = unicodedata.normalize("NFD", t)
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9 ]+", " ", t).strip()


# Checked before the yes list: "no, i can't" must not read as yes.
NO_PHRASES = (
    "no", "nope", "nah", "cant", "cannot", "can not", "not able", "unable", "dont", "do not",
    "didnt", "did not", "wont", "will not", "nobody", "none", "never", "not yet", "no idea",
    "no se", "no tengo", "no puedo", "no podemos", "no hay", "sin luz", "todavia no",
    "no estoy seguro", "no esta", "nadie", "tampoco", "negativo",
    # How people actually say no on the phone.
    "not really", "not at all", "no way", "havent", "hasnt", "isnt", "wasnt", "arent",
    "wrong number", "no one", "not interested", "quien habla",
    # "the power's out" loses its apostrophe long before we see it, and "not tonight" is
    # a no with no "no" in it.
    "powers out", "power went out", "lost power", "lost the power", "no electricity",
    "not tonight", "not today", "sin electricidad", "se fue la electricidad",
    # q_heat is "do you have heat, or is the power out?" - the caller often answers the
    # second half, so the outage itself has to count as the answer.
    "power is out", "power out", "no power", "no heat", "out of power",
    "sin calefaccion", "se fue la luz", "no tengo luz",
)
YES_PHRASES = (
    "yes", "yeah", "yep", "yup", "ya", "sure", "ok", "okay", "correct", "right", "exactly",
    "i can", "we can", "i do", "we do", "i will", "we will", "already", "done", "i did",
    "we did", "covered", "i know", "we know", "se donde", "si puedo", "claro", "por supuesto",
    "afirmativo", "tenemos", "tenemos calefaccion", "puedo", "podemos", "positivo",
    # Filler that means yes out loud, and the hedged agreements.
    "mmhmm", "mhm", "uh huh", "definitely", "absolutely", "of course", "thats right",
    "that is right", "i think so", "i have", "we have", "go ahead", "both", "si senor",
)
REPEAT_PHRASES = (
    "repeat", "again", "say that again", "pardon", "what did you say", "come again",
    "otra vez", "repita", "repite", "no entiendo", "como", "perdon", "que dijo",
)


def classify(text: str) -> bool | None:
    """True / False / None (could not tell). Deliberately conservative: None means re-ask."""
    t = normalise(text)
    if not t:
        return None
    # "I'm not sure" contains "sure"; a hedge is not a yes, it is a reason to ask again.
    if any(k in t for k in HEDGE):
        return None
    # Sentences that are not an answer to anything: a bad line, a confused caller, someone
    # asking who is calling. Score one of those and we record a fiction, so treat it as
    # unheard and ask again.
    _words = set(t.split())
    if any((p in t) if " " in p else (p in _words) for p in UNRELATED):
        return None
    if t.startswith("not "):
        return False
    words = set(t.split())
    for p in NO_PHRASES:
        if " " in p:
            if p in t:
                return False
        elif p in words:
            return False
    for p in YES_PHRASES:
        if " " in p:
            if p in t:
                return True
        elif p in words:
            return True
    if t.startswith("no "):
        return False
    if t.startswith("si ") or t.startswith("yes "):
        return True
    return None


def wants_repeat(text: str) -> bool:
    t = normalise(text)
    return any(p in t for p in REPEAT_PHRASES)


# People rarely answer a yes/no question with "yes". "My mother is elderly" is a yes to
# the needs question and nothing at all to "do you live alone", so the extra reading is
# per-field rather than a looser global classifier.
NEIGHBOR_HINTS = ("next door", "neighbor", "neighbour", "vecino", "vecina", "casa de al lado")
WRONG_PERSON = (
    "wrong number", "no one by that", "nobody by that", "no one here by", "not here",
    "he doesnt live", "she doesnt live", "they dont live", "numero equivocado", "no vive aqui",
    # Someone who does not know us is not the household, whatever they are asking.
    "who is this", "who are you", "quien habla", "quien es",
)
UNRELATED = (
    "cant hear", "cannot hear", "can you hear me", "are you there", "speak up", "breaking up",
    "youre breaking up", "what do you mean", "i dont understand", "do not understand",
    "im confused", "what is this about", "what is this call", "is this a robot",
    "are you a robot", "robocall", "what", "huh", "no entiendo", "no le escucho", "que dijo",
)
SELF_YES = (
    "speaking", "this is he", "this is she", "this is him", "this is her", "yes this is",
    "this is", "thats me", "that is me", "it is me", "yeah thats me", "myself", "im him",
    "im her", "soy yo", "si soy yo", "habla con", "si habla", "al habla", "el habla",
)
HEDGE = ("not sure", "not certain", "dont know", "do not know", "maybe", "no estoy seguro", "quiza")
WHERE_HINTS = (
    "garage", "basement", "crawlspace", "crawl space", "front yard", "back yard", "backyard",
    "alley", "street", "curb", "side of the house", "front of the house", "meter", "driveway",
    "under the house", "utility room", "sotano", "garaje", "patio", "calle", "jardin",
)
AGE = re.compile(r"\b(\d{2})\b")


def age_elderly(text: str) -> bool:
    """"I'm 82" is the most common way someone tells you they need help."""
    return any(60 <= int(m.group(1)) <= 110 for m in AGE.finditer(normalise(text)))


def classify_for(name: str, text: str, first_name: str = "") -> bool | None:
    """The answer to one question, allowing for a statement instead of a yes/no.

    Nobody answers a phone survey in keywords. "Yeah that's me", "this is Danish", "no you
    got the wrong number" and "he's not here" all have to land, so beyond the yes/no lists
    each question gets its own reading of what people really say.
    """
    answer = classify(text)
    if answer is not None:
        return answer
    t = normalise(text)
    if name == "needs_help" and (any(k in t for k in ELDERLY + DISABLED + OUTSIDE) or age_elderly(t)):
        return True
    if name == "neighbor_check" and any(k in t for k in NEIGHBOR_HINTS):
        return True
    if name == "knows_shutoff":
        # Naming a place is knowing, even with no yes in the sentence: "it's in the garage".
        if any(k in t for k in WHERE_HINTS):
            return True
        # "I don't know" is a no to this question, not a reason to ask it again.
        if any(k in t for k in ("dont know", "do not know", "not sure", "no idea", "no se")):
            return False
    if name == "is_household":
        # An honest "I'm not sure" is not a no: re-ask instead of hanging up on them.
        if any(k in t for k in HEDGE):
            return None
        if any(k in t for k in WRONG_PERSON):
            return False
        # "I'm not Danish", "this isn't her", "he doesn't live here" - any negation of who
        # they are, in any word order.
        if re.search(r"\b(not|isnt|arent|aint|doesnt|dont)\b", t) or "no one" in t or "nobody" in t:
            return False
        if any(k in t for k in SELF_YES):
            return True
        # "This is Danish", "Danish speaking", "Danish here" - hearing the name back is the
        # strongest confirmation there is, so it counts even with no yes in the sentence.
        first = normalise(first_name)
        if first and first in t:
            return True
    return None


# Keyword hints for the *single* combined needs question, so a "yes" still fills the
# three separate fields assess() and the console expect.
ELDERLY = ("elderly", "old", "older", "grandma", "grandmother", "grandpa", "my mother", "my father", "senior", "mayor", "abuela", "abuelo", "anciano")
DISABLED = ("disabled", "disability", "wheelchair", "walker", "bedridden", "handicap", "discapacidad", "silla de ruedas", "cama")
OUTSIDE = ("cant go outside", "cannot go outside", "no puedo salir", "no podemos salir", "hard to go outside", "stairs")


# ---------- answers + assessment ----------

@dataclass
class Answers:
    """Mirrors CallAnswers in src/lib/household.ts, plus the combined answer to q_needs."""
    can_do_steps: bool = False
    did_steps: bool = False
    someone_elderly: bool = False
    someone_disabled: bool = False
    cant_go_outside: bool = False
    lives_alone: bool = False
    knows_shutoff: bool = False
    faucet_covered: bool | None = None
    has_heat: bool = True
    neighbor_check: bool = False
    answered: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "can_do_steps": self.can_do_steps,
            "did_steps": self.did_steps,
            "someone_elderly": self.someone_elderly,
            "someone_disabled": self.someone_disabled,
            "cant_go_outside": self.cant_go_outside,
            "lives_alone": self.lives_alone,
            "knows_shutoff": self.knows_shutoff,
            "faucet_covered": self.faucet_covered,
            "has_heat": self.has_heat,
            "neighbor_check": self.neighbor_check,
        }


def assess(a: Answers) -> str:
    """Mirror of assess() in src/lib/household.ts. Confirmed answers only."""
    vulnerable = a.someone_elderly or a.someone_disabled or a.cant_go_outside
    if (not a.can_do_steps) or ((not a.has_heat) and vulnerable):
        return "needs_crew"
    if not a.did_steps:
        return "needs_reminder"
    return "ready"


def closing_key(assessment: str, assigned_crew: str | None) -> str:
    """The honesty rule, as code. A crew is "on the way" only if one is actually assigned."""
    if assessment == "needs_crew":
        if assigned_crew:
            return "agent_crew_assigned"
        return "agent_crew_requested"
    if assessment == "needs_reminder":
        return "agent_reminder"
    return "agent_ready"


# ---------- the conversation ----------

@dataclass
class Turn:
    kind: str            # "say" (read it, no answer expected) | "ask" (wait for an answer)
    key: str
    text: str
    field: str | None = None


# The order and wording of buildConversation() in src/lib/callScript.ts: hello, storm,
# steps, then the questions in order, then the closing.
QUESTION_ORDER = ("q_can_do", "q_needs", "q_alone", "q_shutoff", "q_faucet", "q_heat", "q_neighbor")
FIELD_OF = {
    "q_can_do": "can_do_steps",
    "q_needs": "needs_help",
    "q_alone": "lives_alone",
    "q_shutoff": "knows_shutoff",
    "q_faucet": "faucet_covered",
    "q_heat": "has_heat",
    "q_neighbor": "neighbor_check",
    "q_sees_list": "sees_list",
    "q_is_you": "is_household",
}


class Call:
    def __init__(
        self,
        lang: str = "en",
        level: str = "High",
        temp: int = 19,
        hours_below_20: int = 6,
        steps: tuple[str, str, str] = ("", "", ""),
        has_outdoor_faucet: bool = True,
        replied_text: bool = False,
        assigned_crew: str | None = None,
        hard_of_hearing: bool = False,
        first_name: str = "",
        street: str = "",
        text_sent: bool = False,
    ) -> None:
        if lang not in LANGS:
            raise ValueError(f"lang must be one of {LANGS}")
        self.lang = lang
        self.level = level
        self.temp = temp
        self.hours_below_20 = hours_below_20
        self.steps = steps
        self.has_outdoor_faucet = has_outdoor_faucet
        self.assigned_crew = assigned_crew
        # Filled from the sign-up row when we have one: the greeting addresses the household by
        # name, and the street name proves we are talking about the right house.
        self.first_name = first_name.strip()
        self.street = street.strip()
        # True only when the checklist SMS has actually been accepted by the carrier. The agent
        # may say "I've texted you" in that case and nothing stronger otherwise.
        self.text_sent = text_sent
        self.sees_list: bool | None = None
        # Wrong number: end the call where it is, do not run the survey at a stranger.
        self.is_household: bool | None = None
        self.ended = False
        self.hard_of_hearing = hard_of_hearing
        self.answers = Answers()
        self.turns: list[Turn] = []
        self.i = 0
        self.attempts = 0
        self.closed = False
        self.said: list[tuple[str, str]] = []   # (who, text) - the transcript
        self._build(replied_text)

    def _say(self, key: str, params: dict[str, object] | None = None) -> Turn:
        return Turn("say", key, line(key, self.lang, params))

    def _ask(self, key: str, params: dict[str, object] | None = None) -> Turn:
        return Turn("ask", key, line(key, self.lang, params), FIELD_OF[key])

    def _greeting(self, replied_text: bool) -> Turn:
        """Name and street when the sign-up gave us them; the plain line when it did not.

        Never improvise the name: a call that greets "Maria" at the wrong address is worse
        than one that greets nobody.
        """
        if replied_text:
            return self._say("agent_hello_text")
        if self.first_name and self.street:
            return self._say("agent_hello_named", {"first_name": self.first_name, "street": self.street})
        if self.first_name:
            return self._say("agent_hello_name", {"first_name": self.first_name})
        return self._say("agent_hello")

    def _build(self, replied_text: bool) -> None:
        level_word = messages()["levelWord"][self.level][self.lang]
        self.turns.append(self._greeting(replied_text))
        if self.first_name:
            # "Hello, is this Danish?" - confirm who picked up before anything else. The name is
            # the only thing we know about them, so it doubles as the identity check.
            self.turns.append(self._ask("q_is_you", {"first_name": self.first_name}))
        if self.hours_below_20 > 0:
            self.turns.append(self._say("agent_storm", {"temp": self.temp, "hours": self.hours_below_20, "level": level_word}))
        else:
            self.turns.append(self._say("agent_storm_mild", {"temp": self.temp, "level": level_word}))
        self.turns.append(self._say("agent_steps", {"step1": self.steps[0], "step2": self.steps[1], "step3": self.steps[2]}))
        for key in QUESTION_ORDER:
            if key == "q_faucet" and not self.has_outdoor_faucet:
                continue  # nothing to ask: no outdoor faucet
            self.turns.append(self._ask(key))

    # --- runtime ---

    @property
    def current(self) -> Turn | None:
        self._maybe_close()
        return self.turns[self.i] if self.i < len(self.turns) else None

    def speech_speed(self) -> float:
        """Slower for a hard-of-hearing household, a touch quicker when risk is high."""
        if self.hard_of_hearing:
            return 0.9
        return 1.1 if self.level == "High" else 1.0

    def _maybe_close(self) -> None:
        if self.ended or self.closed or self.i < len(self.turns):
            return
        self.closed = True
        if self.answers.neighbor_check:
            self.turns.append(self._say("agent_neighbor"))
        a = assess(self.answers)
        key = closing_key(a, self.assigned_crew)
        if key == "agent_crew_assigned" and not self.assigned_crew:  # pragma: no cover - invariant
            raise AssertionError("refusing to promise a crew that is not assigned")
        if key == "agent_crew_assigned":
            self.turns.append(self._say(key, {"crew": self.assigned_crew}))
        else:
            self.turns.append(self._say(key))

        # The hand-off to the written checklist. A text we have not sent is a text we do not
        # claim to have sent, so the only promise here is conditional on text_sent.
        if self.text_sent:
            self.turns.append(self._ask("q_sees_list"))
        else:
            self.turns.append(self._say("agent_text_pending"))

    def hear(self, transcript: str) -> str:
        """Feed one caller utterance. Returns "ok", "unclear" or "repeat"."""
        turn = self.current
        if turn is None:
            return "ok"
        self.said.append(("you", transcript))
        if wants_repeat(transcript):
            return "repeat"
        if turn.kind == "say":
            self.i += 1
            return "ok"
        answer = classify_for(turn.field or "", transcript, self.first_name)
        if answer is None and self.attempts < 2:
            self.attempts += 1
            # Apologise first, then ask again. Repeating the identical sentence in the same
            # flat tone is the clearest sign that nobody is on the line.
            self.turns.insert(self.i, self._say("agent_didnt_catch"))
            return "unclear"        # the agent re-asks the same question
        self._record(turn.field or "", transcript, answer)
        self.attempts = 0
        self.i += 1
        if answer is None:
            # Unheard three times: admit it rather than move on as if they had answered.
            self.turns.insert(self.i, self._say("agent_couldnt_hear"))
        if turn.field == "sees_list":
            self.sees_list = answer
            self.turns.append(self._say("agent_list_confirmed" if answer else "agent_list_resend"))
        if turn.field == "is_household" and answer is False:
            # Say goodbye now, not after seven questions at a stranger: drop the rest of the
            # survey and end the call where it stands.
            self.turns = self.turns[: self.i]
            self.turns.append(self._say("agent_wrong_number"))
            self.ended = True
        return "ok"

    def _record(self, name: str, transcript: str, answer: bool | None) -> None:
        a = self.answers
        a.answered.append(name)
        # An unclear second attempt uses the safe default: assume they need help, except
        # for heat, where guessing "no heat" would dispatch a crew on a bad line.
        if name == "can_do_steps":
            a.can_do_steps = bool(answer)
        elif name == "needs_help":
            t = normalise(transcript)
            if answer:
                a.someone_elderly = any(k in t for k in ELDERLY) or age_elderly(t)
                a.someone_disabled = any(k in t for k in DISABLED)
                a.cant_go_outside = any(k in t for k in OUTSIDE)
                if not (a.someone_elderly or a.someone_disabled or a.cant_go_outside):
                    a.cant_go_outside = True   # they said yes but not why: treat as needing help
            else:
                a.someone_elderly = a.someone_disabled = a.cant_go_outside = False
        elif name == "lives_alone":
            a.lives_alone = bool(answer)
        elif name == "knows_shutoff":
            a.knows_shutoff = bool(answer)
        elif name == "faucet_covered":
            a.faucet_covered = answer
        elif name == "has_heat":
            a.has_heat = True if answer is None else answer
        elif name == "neighbor_check":
            a.neighbor_check = bool(answer)
        elif name == "is_household":
            self.is_household = answer

    def next_speech(self) -> str | None:
        """The next thing to say out loud, or None when the call is over."""
        turn = self.current
        if turn is None:
            return None
        self.said.append(("agent", turn.text))
        if turn.kind == "say":
            self.i += 1
        return turn.text

    def repeat_last(self) -> str | None:
        for who, text in reversed(self.said):
            if who == "agent":
                return text
        return None

    def result(self) -> dict:
        a = assess(self.answers)
        return {
            "assessment": a,
            "confidence": "confirmed",
            "answers": self.answers.as_dict(),
            "closing": closing_key(a, self.assigned_crew),
            # The 3 steps exactly as read out: the app texts them back once the call finishes.
            "steps": list(self.steps),
            "sees_list": self.sees_list,
            "text_sent": self.text_sent,
            "lang": self.lang,
            "transcript": [{"who": w, "text": t} for w, t in self.said],
        }


# ---------- checks ----------

REQUIRED_KEYS = (
    "agent_hello", "agent_hello_text", "agent_storm", "agent_storm_mild", "agent_steps",
    *QUESTION_ORDER, "agent_neighbor", "agent_crew_requested", "agent_crew_assigned",
    "agent_reminder", "agent_ready", "q_is_you", "agent_wrong_number", "agent_didnt_catch",
)


def check() -> int:
    """Proves every line exists in both languages and no call can invent a crew."""
    pack = messages()
    problems: list[str] = []
    for key in REQUIRED_KEYS:
        for lang in LANGS:
            if not pack["call"].get(key, {}).get(lang):
                problems.append(f'missing call.{key}.{lang}')
    for level in ("High", "Watch", "Low"):
        for lang in LANGS:
            if not pack.get("levelWord", {}).get(level, {}).get(lang):
                problems.append(f"missing levelWord.{level}.{lang}")

    # The honesty rule: with no crew assigned, every possible ending must avoid the
    # promise line - for every combination of answers, not just a happy path.
    import itertools

    promise = pack["call"]["agent_crew_assigned"]["en"]
    checked = 0
    for can_do, heat, vuln, did in itertools.product((True, False), repeat=4):
        a = Answers(can_do_steps=can_do, has_heat=heat, cant_go_outside=vuln, did_steps=did)
        key = closing_key(assess(a), None)
        checked += 1
        if key == "agent_crew_assigned":
            problems.append(f"a call with no crew would promise one ({can_do=} {heat=} {vuln=} {did=})")
        text = line(key, "en")
        if text == promise or "{crew}" in text:
            problems.append(f"closing {key} names a crew with none assigned")
    for lang in LANGS:
        for key in ("agent_crew_requested", "agent_reminder", "agent_ready"):
            if "is on the way" in pack["call"][key][lang] or "va en camino" in pack["call"][key][lang]:
                problems.append(f"call.{key}.{lang} implies help is on the way")

    # A full call, end to end, in both languages.
    for lang in LANGS:
        call = Call(lang=lang, level="High", temp=19, hours_below_20=6,
                    steps=("Close the crawlspace vents.", "Open the kitchen cabinet.", "Don't drip tonight."))
        said = 0
        while (turn := call.current) is not None:
            if turn.kind == "ask":
                call.hear("no" if turn.field in ("can_do_steps", "neighbor_check") else "yes")
            else:
                call.next_speech()
            said += 1
            if said > 40:
                problems.append(f"{lang}: the call never ended")
                break
        if call.result()["assessment"] != "needs_crew":
            problems.append(f"{lang}: expected needs_crew, got {call.result()['assessment']}")

    # A named call confirms who picked up, and stops at a stranger instead of running the
    # survey at the wrong person.
    wrong = Call(lang="en", level="High", temp=19, hours_below_20=6,
                 steps=("a", "b", "c"), first_name="Danish", street="Harvard St")
    wrong.next_speech()                      # the greeting
    asked = wrong.current
    if asked is None or asked.field != "is_household":
        problems.append("a named call does not ask whether it reached the household")
    else:
        wrong.next_speech()                  # "Am I speaking with Danish?"
        wrong.hear("sorry, no one here by that name")
        left = 0
        while (turn := wrong.current) is not None:
            wrong.next_speech()
            left += 1
            if left > 4:
                problems.append("a call to the wrong person did not end")
                break
        if line("agent_wrong_number", "en") not in [t for w, t in wrong.said if w == "agent"]:
            problems.append("a call to the wrong person never says goodbye")

    if problems:
        print(f"{len(problems)} problem(s):")
        for p in problems:
            print(f"  - {p}")
        return 1
    print(f"call lines checked: {len(REQUIRED_KEYS) * len(LANGS)} in {len(LANGS)} languages")
    print(f"endings checked for the crew promise: {checked} answer combinations, 0 promises without a crew")
    print("full calls completed: 2")
    print("All call lines covered.")
    return 0


def demo(lang: str, level: str, temp: int, hours: int, crew: str | None, hearing: bool) -> int:
    call = Call(
        lang=lang, level=level, temp=temp, hours_below_20=hours,
        steps=("Close the crawlspace vents.", "Open the cabinet under the kitchen sink.", "Don't drip tonight."),
        assigned_crew=crew, hard_of_hearing=hearing,
    )
    print(f"--- simulated call ({lang}, {level}, crew={crew or 'none'}) ---")
    while (turn := call.current) is not None:
        print(f"agent: {call.next_speech()}")
        if turn.kind != "ask":
            continue
        try:
            said = input("you:   ").strip()
        except EOFError:
            said = "yes"
        outcome = call.hear(said)
        if outcome == "repeat":
            print(f"agent: {call.repeat_last()}")
        elif outcome == "unclear":
            pass    # the script queues its own apology and re-asks; the loop speaks it next
    print(f"\nassessment: {call.result()['assessment']}  closing: {call.result()['closing']}")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="FreezeLine call script (deterministic, no model).")
    ap.add_argument("--check", action="store_true", help="verify coverage and the crew honesty rule")
    ap.add_argument("--demo", action="store_true", help="run one conversation in the terminal")
    ap.add_argument("--lang", choices=LANGS, default="en")
    ap.add_argument("--level", choices=("High", "Watch", "Low"), default="High")
    ap.add_argument("--temp", type=int, default=19)
    ap.add_argument("--hours", type=int, default=6, help="hours below 20F so far (0 = mild night)")
    ap.add_argument("--crew", help="a crew name, if one is already assigned")
    ap.add_argument("--hard-of-hearing", action="store_true", help="speak at 0.9x")
    a = ap.parse_args(argv)
    if a.check:
        return check()
    if a.demo:
        return demo(a.lang, a.level, a.temp, a.hours, a.crew, a.hard_of_hearing)
    ap.print_help()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
