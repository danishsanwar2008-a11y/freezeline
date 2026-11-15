"""The pre-survey call: the five questions from the research doc, some days before the storm.

Each answer carries the risk band the doc gives it, and the home's band is the worst of the
five. Same rules as voice/script.py: every word comes from data/messages.json, the agent never
states a risk it did not compute, and a wrong number ends the call instead of running the
survey at a stranger.

  python voice/survey.py --check     # the five questions, scored, in both languages
  python voice/survey.py --demo      # answer in the terminal and watch the call

The other script (voice/script.py) is the storm-night call. This one is the visit that happens
days before, which is why it asks about insulation and past bursts instead of tonight's steps.
"""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path
from typing import Callable

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from script import (  # noqa: E402  (path set above so this works from anywhere)
    LANGS,
    UNRELATED,
    Turn,
    classify,
    classify_for,
    line,
    normalise,
    wants_repeat,
)

# The doc's three bands, worst last.
SEVERITY = {"low": 0, "medium": 1, "high": 2}
BAND_NAME = {0: "Low", 1: "Medium", 2: "High"}

# The seven questions, in the doc's order (FreezeLine Research, section 2).
FULL_QUESTION_KEYS = (
    "q_pipe_runs",
    "q_pipe_material",
    "q_home_age",
    "q_insulated",
    "q_shutoff_access",
    "q_frozen_before",
    "q_someone_home",
)
# The demo call asks only these 4 (the doc's questions 3-6), to keep it short. The score is worked
# out over the questions asked (score()), so dropped ones never count against a home.
# VOICE_FULL_SURVEY=1 asks all seven again.
DEMO_QUESTION_KEYS = ("q_home_age", "q_insulated", "q_shutoff_access", "q_frozen_before")
QUESTION_KEYS = FULL_QUESTION_KEYS if os.environ.get("VOICE_FULL_SURVEY", "").strip() == "1" else DEMO_QUESTION_KEYS
FIELDS = ("pipe_runs", "pipe_material", "home_age", "insulated", "shutoff_access", "frozen_before", "someone_home")

# The team's weights. Pipe material, home age and past frozen pipes carry 75% (25% each);
# insulation and where the pipes run carry 25% (12.5% each). Shutoff access and whether anyone
# is home don't score: they decide what happens next (a neighbor, the emergency contact, a crew).
WEIGHTS = {
    "pipe_material": 0.25,
    "home_age": 0.25,
    "frozen_before": 0.25,
    "insulated": 0.125,
    "pipe_runs": 0.125,
}
BAND_POINTS = {"low": 0.0, "medium": 0.5, "high": 1.0}
# A weighted score at or above this fails the pre-survey (the text table's X).
FAIL_AT = 0.5

# Forecast temperature, the text table's other column.
MILD_AT_F = 32   # >= 32F: mild (the table's check mark)
COLD_AT_F = 20   # 20-31F: cold; below 20F: very cold

FIELD_OF = {
    "q_pipe_runs": "pipe_runs",
    "q_pipe_material": "pipe_material",
    "q_home_age": "home_age",
    "q_insulated": "insulated",
    "q_shutoff_access": "shutoff_access",
    "q_frozen_before": "frozen_before",
    "q_someone_home": "someone_home",
    "q_is_you": "is_household",
    "q_sees_list": "sees_list",
    "q_neighbor_help": "neighbor_help",
}

# ---------- reading the answers ----------
#
# The doc asks where the pipes run and gives three answers. People answer it in their own
# words ("they go through the garage", "under the concrete"), so the reading is by place,
# not by the doc's exact label.

# Checked first: a garage is a garage even if they also mention the walls.
PIPE_OUTSIDE = (
    "garage", "basement", "outside", "exterior", "outdoors", "crawlspace", "crawl space",
    "in the yard", "under the dirt", "sotano", "garaje", "afuera", "exterior", "patio",
)
PIPE_SLAB = (
    "slab", "concrete", "under the floor", "in the floor", "beneath the floor",
    "losa", "concreto", "bajo el piso",
)
PIPE_INTERIOR = (
    "inside the wall", "in the walls", "interior", "heated", "inside the house", "in the house",
    "through the house", "attic", "ceiling", "closet", "dentro de las paredes", "interior",
    "calefaccion", "atico",
)

INSULATED_MOSTLY = ("mostly", "most of", "most", "some of", "some", "partly", "partial", "half", "a few", "algunas", "casi todas")
INSULATED_NO = ("not insulated", "no insulation", "none", "bare", "uncovered", "uninsulated", "nada", "no estan", "sin aislar")
INSULATED_YES = ("insulated", "wrapped", "covered", "all of them", "all", "aisladas", "forradas", "cubiertas")

SHUTOFF_CANNOT = (
    "cant", "cannot", "can not", "not able", "unable", "hard to", "too heavy", "too low", "no puedo", "dificil",
    # Checked before SHUTOFF_OK, whose "get to it" / "i know where" sit inside these sentences.
    "wont", "will not", "not be able", "wouldnt", "would not", "couldnt", "could not", "no way",
    "dont think i can", "do not think i can", "no podria", "no voy a poder",
)
# Not knowing where it is counts as not being able to get to it (scored High, like "can't").
SHUTOFF_UNKNOWN = ("dont know where", "do not know where", "no idea where", "not sure where", "never found", "no se donde", "no sé donde")

# Pipe material, as people say it and as speech-to-text spells it. Copper first: "copper and
# some PEX" is still copper in places, the riskier answer.
MATERIAL_COPPER = ("copper", "cobre", "metal", "galvanized", "steel", "iron")
MATERIAL_PVC = ("cpvc", "c p v c", "pvc", "p v c", "white plastic", "rigid plastic")
MATERIAL_PEX = ("pex", "pecs", "pecks", "peks", "p e x", "flexible", "red and blue", "plastic tubing", "plastico flexible")

NUMBER_WORDS = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9,
    "ten": 10, "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14, "fifteen": 15, "sixteen": 16,
    "seventeen": 17, "eighteen": 18, "nineteen": 19, "twenty": 20, "thirty": 30, "forty": 40, "fifty": 50,
    "sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90, "hundred": 100,
    "uno": 1, "dos": 2, "tres": 3, "cuatro": 4, "cinco": 5, "seis": 6, "siete": 7, "ocho": 8, "nueve": 9,
    "diez": 10, "quince": 15, "veinte": 20, "treinta": 30, "cuarenta": 40, "cincuenta": 50,
    "sesenta": 60, "setenta": 70, "ochenta": 80, "noventa": 90, "cien": 100,
}
NEW_HOME = ("brand new", "new build", "new construction", "just built", "nueva", "recien construida")


def home_age_years(t: str, this_year: int | None = None) -> int | None:
    """Years old, from "built in 1978", "about 45 years", "forty five", "it's brand new"."""
    import datetime

    year_now = this_year or datetime.date.today().year
    for m in re.finditer(r"\b(1[89]\d\d|20[0-4]\d)(?!\d)", t):  # 1978, also "the 1970s"
        y = int(m.group(1))
        if y <= year_now:
            return year_now - y
    m = re.search(r"\b([1-9]0)s\b", t)  # "built in the 70s"
    if m:
        d = int(m.group(1))
        return year_now - (1900 + d if 1900 + d <= year_now - 25 else 2000 + d)
    m = re.search(r"\b(\d{1,3})\b", t)
    if m:
        return int(m.group(1))
    total, seen = 0, False
    for w in t.split():
        if w in NUMBER_WORDS:
            n = NUMBER_WORDS[w]
            total = total * n if n == 100 and total else total + n
            seen = True
    if seen:
        return total
    if any(p in t for p in NEW_HOME):
        return 0
    return None
SHUTOFF_OK = ("i can", "can get", "reach it", "get to it", "turn it", "i know where", "easy", "puedo", "llego", "cierro")


def read_survey(field: str, text: str) -> object:
    """The doc's answer for one question, from whatever the person actually said."""
    # "No, they're in the garage" answers "do you know where your pipes run?" with a place: the
    # opening "no," is a reply to the question's wording, not a negated place. Dropped here, only
    # for these questions (on the shutoff question a leading "no" IS the answer).
    if field in ("pipe_runs", "pipe_material", "home_age"):
        text = re.sub(r"^\s*(no|nope|nah)\s*[,.!;:-]+\s*", "", text, flags=re.I)
    t = normalise(text)
    if not t:
        return None
    # A named pipe material is an answer even inside "I don't know what they're made of... PVC"
    # (the "what" would otherwise read as a question back), unless they're asking what it means.
    if field == "pipe_material" and "mean" not in t.split():
        for value, mat_words in (("copper", MATERIAL_COPPER), ("pvc", MATERIAL_PVC), ("pex", MATERIAL_PEX)):
            if any(w in t for w in mat_words):
                return value
    # Before any place name is matched: a question back at us ("what do you mean by heated
    # space") mentions the very words we look for, so it has to be dismissed first.
    words = set(t.split())
    if any((p in t) if " " in p else (p in words) for p in UNRELATED):
        return None
    if field == "pipe_runs":
        # "I don't have a garage" mentions a garage without answering anything. Any negated
        # place is held back for a re-ask rather than scored as that place.
        if re.search(r"\b(no|not|dont|doesnt|isnt|never)\b[^.]{0,20}(garage|basement|slab|concrete|attic|outside|crawlspace)", t):
            return None
        for band, words in (("outside", PIPE_OUTSIDE), ("slab", PIPE_SLAB), ("interior", PIPE_INTERIOR)):
            if any(w in t for w in words):
                return band
        return None
    if field == "insulated":
        if any(w in t for w in INSULATED_MOSTLY):
            return "mostly"
        if any(w in t for w in INSULATED_NO):
            return "no"
        if any(w in t for w in INSULATED_YES):
            return "yes"
        a = classify(text)
        return "yes" if a else ("no" if a is False else None)
    if field == "pipe_material":
        for value, words in (("copper", MATERIAL_COPPER), ("pvc", MATERIAL_PVC), ("pex", MATERIAL_PEX)):
            if any(w in t for w in words):
                return value
        return None
    if field == "home_age":
        return home_age_years(t)
    if field == "shutoff_access":
        if any(w in t for w in SHUTOFF_UNKNOWN):
            return "cannot"
        if any(w in t for w in SHUTOFF_CANNOT):
            return "cannot"
        # "No, I know where it is but I won't be able to..." opens with the answer: the question
        # asks whether they'd be able to, so a leading "no" is a no ("no problem" is the exception).
        if re.match(r"(no|nope|nah)\b", t) and not t.startswith("no problem"):
            return "cannot"
        if any(w in t for w in SHUTOFF_OK):
            return "ok"
        a = classify(text)
        return "ok" if a else ("cannot" if a is False else None)
    if field in ("frozen_before", "someone_home"):
        return classify(text)
    return None


# Questions where "I don't know" or "no" moves the call on ("Got it, no problem. I'll move on.")
# instead of asking again: the household can't know, and asking twice more only annoys them.
SKIPPABLE = ("pipe_runs", "pipe_material", "home_age")
DONT_KNOW = (
    "dont know", "do not know", "not sure", "no idea", "idk", "im not sure", "unsure", "no clue",
    "cant remember", "dont remember", "couldnt tell", "have no idea", "never checked",
    "no se", "ni idea", "no estoy seguro", "no me acuerdo",
)
JUST_NO = ("no", "nope", "nah", "no sir", "no maam", "not really", "no i dont")


def doesnt_know(text: str) -> bool:
    """'I don't know', 'not sure', or a plain 'no' (to "do you know where your pipes run?")."""
    t = normalise(text)
    if not t:
        return False
    if any(p in t for p in DONT_KNOW):
        return True
    return t in JUST_NO or t.rstrip(" .") in JUST_NO


def survey_texts() -> dict:
    """data/messages.json `surveyTexts`: the doc's text table, which also gives each row's priority."""
    return __import__("script").messages()["surveyTexts"]


def band_of(field: str, value: object) -> str:
    """The risk band the doc gives one answer. Unknown is medium: never quietly low."""
    if field == "pipe_runs":
        return {"interior": "low", "slab": "medium", "outside": "high"}.get(str(value), "medium")
    if field == "pipe_material":
        return {"pex": "low", "pvc": "medium", "copper": "high"}.get(str(value), "medium")
    if field == "home_age":
        if not isinstance(value, int):
            return "medium"
        return "low" if value < 20 else ("medium" if value <= 40 else "high")
    if field == "insulated":
        return {"yes": "low", "mostly": "medium", "no": "high"}.get(str(value), "medium")
    if field == "shutoff_access":
        return {"ok": "low", "cannot": "high"}.get(str(value), "medium")
    if field == "frozen_before":
        return "high" if value is True else ("low" if value is False else "medium")
    if field == "someone_home":
        # Nobody home for three days is when a burst pipe runs unattended.
        return "low" if value is True else ("high" if value is False else "medium")
    return "medium"


class Survey:
    """One pre-survey call. Same interface as script.Call, so the agent runs either one."""

    def __init__(
        self,
        lang: str = "en",
        first_name: str = "",
        street: str = "",
        text_sent: bool = False,
        replies: dict | None = None,
        temp: float | None = None,
        emergency_name: str = "",
        assign_crew: Callable[[list[str]], str | None] | None = None,
        questions: tuple[str, ...] | None = None,
    ) -> None:
        if lang not in LANGS:
            raise ValueError(f"lang must be one of {LANGS}")
        self.lang = lang
        # Which questions this call asks (QUESTION_KEYS: the 4-question demo set unless
        # VOICE_FULL_SURVEY=1); the score is worked out over these only.
        self.questions = tuple(questions or QUESTION_KEYS)
        # The forecast low for the home's area, in F. Unknown = no freeze forecast = mild.
        self.temp = temp
        # Questions the household said they don't know (moved on politely; scored as Medium).
        self.skipped: list[str] = []
        # The emergency contact from the household's sign-up (/register). Empty = none on file,
        # so the agent never offers to call someone it can't reach.
        self.emergency_name = emergency_name.strip()
        # Asks the web app to assign the nearest free crew in the home's area; returns the crew's
        # name only once a crew is really assigned (None = all busy, or no app to ask). Only then
        # may the call say a crew is on the way.
        self.assign_crew = assign_crew
        self.crew: str | None = None
        self.first_name = first_name.strip()
        self.street = street.strip()
        self.text_sent = text_sent
        # What the console already knows from the sign-up row. The agent confirms these rather
        # than asking cold, when the caller has not told us otherwise.
        self.replies = replies or {}
        self.answers: dict[str, object] = {}
        self.sees_list: bool | None = None
        self.is_household: bool | None = None
        self.ended = False
        self.closed = False
        self.attempts = 0
        self.i = 0
        self.said: list[tuple[str, str]] = []
        self.turns: list[Turn] = []
        self._build()

    # --- building ---

    def _say(self, key: str, params: dict[str, object] | None = None) -> Turn:
        return Turn("say", key, line(key, self.lang, params))

    def _ask(self, key: str, params: dict[str, object] | None = None) -> Turn:
        return Turn("ask", key, line(key, self.lang, params), FIELD_OF[key])

    def _greeting(self) -> Turn:
        if self.first_name and self.street:
            return self._say("agent_hello_named", {"first_name": self.first_name, "street": self.street})
        if self.first_name:
            return self._say("agent_hello_name", {"first_name": self.first_name})
        return self._say("agent_hello")

    def _build(self) -> None:
        self.turns.append(self._greeting())
        if self.first_name:
            self.turns.append(self._ask("q_is_you", {"first_name": self.first_name}))
        for key in self.questions:
            self.turns.append(self._ask(key))

    # --- runtime (the interface voice/agent.py drives) ---

    @property
    def current(self) -> Turn | None:
        self._maybe_close()
        return self.turns[self.i] if self.i < len(self.turns) else None

    def speech_speed(self) -> float:
        # A risk band is not an emergency: speak at a normal pace.
        return 1.0

    def _maybe_close(self) -> None:
        if self.ended or self.closed or self.i < len(self.turns):
            return
        self.closed = True
        # Priority, then what happens next, then the text. "On the way" is said only for a crew
        # the web app has actually assigned; everything else is "I'll call" / "I'm requesting".
        self.turns.append(self._say({"Low": "survey_low", "Medium": "survey_medium", "High": "survey_high"}[self.level()]))
        followup = self.followup()
        if followup == "contact":
            self.turns.append(self._say("survey_followup_contact", {"emergency_name": self.emergency_name}))
        elif followup == "crew":
            try:
                self.crew = self.assign_crew(self.contact_reasons()) if self.assign_crew else None
            except Exception:  # noqa: BLE001 - no answer from the app means no crew assigned
                self.crew = None
            if self.crew:
                self.turns.append(self._say("survey_followup_crew_assigned", {"crew": self.crew}))
            else:
                self.turns.append(self._say("survey_followup_crew_requested"))
        if self.text_sent:
            self.turns.append(self._ask("q_sees_list"))
        else:
            self.turns.append(self._say("survey_text_pending"))

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

        field = turn.field or ""
        if field in ("is_household", "sees_list"):
            answer = classify_for(field, transcript, self.first_name)
        elif field == "neighbor_help":
            answer = classify(transcript)
        else:
            answer = read_survey(field, transcript)

        # Where the pipes run, what they're made of, how old the home is: "I don't know" (or a plain
        # "no") is an answer, not a bad line. Say so kindly and move on instead of asking again. It's
        # left unanswered, so it counts as Medium in the score (never quietly Low).
        if answer is None and field in SKIPPABLE and doesnt_know(transcript):
            self.attempts = 0
            self.i += 1
            self.skipped.append(field)
            self.turns.insert(self.i, self._say("agent_skip"))
            return "ok"

        # Ask again, twice, before giving up. A single miss is a noisy room or a hesitation,
        # not an answer, and skipping the question loses the fact the survey exists to collect.
        if answer is None and self.attempts < 2:
            self.attempts += 1
            self.turns.insert(self.i, self._say("agent_didnt_catch"))
            return "unclear"

        self.attempts = 0
        self.i += 1
        if answer is None:
            # Third time unheard: say so out loud instead of sliding silently to the next
            # question as if they had answered.
            self.turns.insert(self.i, self._say("agent_couldnt_hear"))

        if field == "is_household" and answer is False:
            self.turns = self.turns[: self.i]
            self.turns.append(self._say("agent_wrong_number"))
            self.ended = True
            return "ok"
        if field == "sees_list":
            self.sees_list = answer
            self.turns.append(self._say("agent_list_confirmed" if answer else "agent_list_resend"))
            return "ok"
        if field in FIELDS or field == "neighbor_help":
            self.answers[field] = answer
        # Knows where the shutoff is but can't get to it: is there someone who can help? Asked
        # only when the sign-up names an emergency contact, since that is who the agent will call.
        if field == "shutoff_access" and answer == "cannot" and self.emergency_name:
            self.turns.insert(self.i, self._ask("q_neighbor_help", {"emergency_name": self.emergency_name}))
        return "ok"

    def next_speech(self) -> str | None:
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

    # --- the score ---

    def bands(self) -> dict[str, str]:
        return {f: band_of(f, self.answers.get(f)) for f in FIELDS}

    def score(self) -> float:
        """Weighted pre-survey risk, 0 (all Low) to 1 (all High), over the questions this call asks
        (their weights scaled to add up to 1). Asked but unanswered counts as Medium."""
        asked = {FIELD_OF[k] for k in self.questions}
        weights = {f: w for f, w in WEIGHTS.items() if f in asked}
        total = sum(weights.values())
        if not total:
            return 0.0
        return round(sum(w * BAND_POINTS[band_of(f, self.answers.get(f))] for f, w in weights.items()) / total, 4)

    def survey_pass(self) -> bool:
        return self.score() < FAIL_AT

    def temp_band(self) -> str:
        if self.temp is None or self.temp >= MILD_AT_F:
            return "mild"
        return "cold" if self.temp >= COLD_AT_F else "very_cold"

    def text_row(self) -> str:
        """The row of the doc's text table this home lands on (the 2 missing rows use their nearest)."""
        key = f"{self.temp_band()}|{'pass' if self.survey_pass() else 'fail'}"
        return survey_texts()["use_row"].get(key, key)

    def level(self) -> str:
        """The home's priority: the category of its row in the text table (Low / Medium / High)."""
        return survey_texts()["messages"][self.text_row()]["level"]

    def contact_reasons(self) -> list[str]:
        """Why the home needs someone there: can't reach the shutoff, and/or nobody home 3 days."""
        out = []
        if self.answers.get("shutoff_access") == "cannot":
            out.append("shutoff")
        if self.answers.get("someone_home") is False:
            out.append("away")
        return out

    def followup(self) -> str | None:
        """Who helps next: "contact" (the emergency contact, called right after this call; a crew
        if they can't), "crew" (a crew now), or None.

        Can't reach the shutoff: "is there a neighbor who can help? I can call {emergency
        contact}" - yes calls them, no (or nobody on file) is a crew. Nobody home for three days:
        the emergency contact, else a crew.
        """
        reasons = self.contact_reasons()
        if not reasons:
            return None
        if "shutoff" in reasons:
            return "contact" if self.emergency_name and self.answers.get("neighbor_help") is True else "crew"
        return "contact" if self.emergency_name else "crew"

    def assessment(self) -> str:
        """The officials' outcome: hands-on help needed, a reminder, or ready."""
        if self.followup():
            return "needs_crew"
        return "ready" if self.level() == "Low" else "needs_reminder"

    def result(self) -> dict:
        return {
            "mode": "survey",
            "level": self.level(),
            "score": self.score(),
            "survey_pass": self.survey_pass(),
            "temp_band": self.temp_band(),
            "text_row": self.text_row(),
            "followup": self.followup(),
            "contact_reasons": self.contact_reasons(),
            "emergency_name": self.emergency_name,
            "crew": self.crew,
            "assessment": self.assessment(),
            "first_name": self.first_name,
            "bands": self.bands(),
            "answers": dict(self.answers),
            "sees_list": self.sees_list,
            "text_sent": self.text_sent,
            "lang": self.lang,
            "transcript": [{"who": w, "text": t} for w, t in self.said],
        }


# ---------- checks ----------

def check() -> int:
    """Every question and closing exists in both languages, and the scoring follows the doc."""
    problems: list[str] = []
    pack = __import__("script").messages()["call"]
    keys = (*FULL_QUESTION_KEYS, "q_is_you", "survey_low", "survey_medium", "survey_high", "survey_text_pending",
            "q_neighbor_help", "agent_skip", "survey_followup_contact", "survey_followup_crew_assigned", "survey_followup_crew_requested")
    for key in keys:
        for lang in LANGS:
            if not pack.get(key, {}).get(lang):
                problems.append(f"missing call.{key}.{lang}")

    # The doc's bands, answer by answer.
    expect = [
        ("pipe_runs", "inside the walls in a heated space", "low"),
        ("pipe_runs", "under the concrete slab", "medium"),
        ("pipe_runs", "they run through the garage and basement", "high"),
        ("pipe_material", "they're PEX", "low"),
        ("pipe_material", "I think it's the red and blue flexible kind", "low"),
        ("pipe_material", "white PVC", "medium"),
        ("pipe_material", "c p v c", "medium"),
        ("pipe_material", "copper", "high"),
        ("home_age", "about 10 years", "low"),
        ("home_age", "it's brand new", "low"),
        ("home_age", "thirty five years", "medium"),
        ("home_age", "40", "medium"),
        ("home_age", "it was built in 1965", "high"),
        ("home_age", "built in the 70s", "high"),
        ("home_age", "fifty years old", "high"),
        ("insulated", "yes, all insulated", "low"),
        ("insulated", "mostly", "medium"),
        ("insulated", "no, they're bare", "high"),
        ("shutoff_access", "yes I know where it is and I can turn it", "low"),
        ("shutoff_access", "I know where it is but I can't turn it", "high"),
        ("shutoff_access", "I don't know where it is", "high"),
        # Said on a real demo call, and once scored "can reach it":
        ("shutoff_access", "No, I know where they are but I won't be able to get to it and turn it.", "high"),
        ("shutoff_access", "I know where it is but I wouldn't be able to turn it", "high"),
        ("shutoff_access", "I don't think I can get to it", "high"),
        ("shutoff_access", "no", "high"),
        ("shutoff_access", "No problem, I can get to it", "low"),
        ("shutoff_access", "yeah it's in the garage and I can turn it", "low"),
        ("shutoff_access", "yes", "low"),
        ("frozen_before", "yes, two years ago", "high"),
        ("frozen_before", "no, never", "low"),
        ("someone_home", "yes", "low"),
        ("someone_home", "no, we'll be away", "high"),
    ]
    for field, said, want in expect:
        got = read_survey(field, said)
        band = band_of(field, got)
        if band != want:
            problems.append(f"{field}: {said!r} scored {band}, expected {want}")

    # The weights: the three 25% questions alone decide a fail; the two 12.5% ones can't.
    def scored(answers: dict, temp: float | None) -> Survey:
        s = Survey(questions=FULL_QUESTION_KEYS, lang="en", temp=temp)
        s.answers = dict(answers)
        return s

    best = {"pipe_runs": "interior", "pipe_material": "pex", "home_age": 5, "insulated": "yes",
            "shutoff_access": "ok", "frozen_before": False, "someone_home": True}
    if scored(best, 40).score() != 0:
        problems.append("all-Low answers should score 0")
    if not scored({**best, "frozen_before": True}, 40).survey_pass():
        problems.append("a past frozen pipe alone (25%) should still pass")
    if scored({**best, "pipe_material": "copper", "home_age": 60}, 40).survey_pass():
        problems.append("copper pipes in a 60-year-old home (50%) should fail")
    if not scored({**best, "insulated": "no", "pipe_runs": "outside"}, 40).survey_pass():
        problems.append("bare pipes in the garage alone (25%) should still pass")

    # The doc's 4 rows, and the 2 combinations it has no row for.
    worst = {"pipe_runs": "outside", "pipe_material": "copper", "home_age": 60, "insulated": "no",
             "shutoff_access": "cannot", "frozen_before": True, "someone_home": False}
    rows = [
        (best, 40, "mild|pass", "Low"),
        (worst, 40, "mild|fail", "Medium"),
        (worst, 10, "very_cold|fail", "High"),
        (best, 25, "cold|pass", "Medium"),
        (best, 10, "cold|pass", "Medium"),        # very cold + pass: nearest row
        (worst, 25, "very_cold|fail", "High"),    # cold + fail: nearest row
        (best, None, "mild|pass", "Low"),         # no forecast: mild
    ]
    for answers, temp, row, level in rows:
        s = scored(answers, temp)
        if (s.text_row(), s.level()) != (row, level):
            problems.append(f"temp {temp}, {'best' if answers is best else 'worst'} answers: got {s.text_row()} {s.level()}, expected {row} {level}")
    # "I don't know" / "no" on where the pipes run, what they're made of and how old the home is:
    # one "Got it, no problem. I'll move on." and the next question, never a re-ask; scored Medium.
    for lang in LANGS:
        for said in ("I don't know", "no", "not sure, sorry", "No idea."):
            s = Survey(questions=FULL_QUESTION_KEYS, lang=lang, first_name="Danish", temp=12)
            heard = {"is_household": "yes", "pipe_runs": said, "pipe_material": said, "home_age": said,
                     "insulated": "no", "shutoff_access": "yes I can turn it", "frozen_before": "no", "someone_home": "yes"}
            asked: list[str] = []
            n = 0
            while (turn := s.current) is not None and n < 60:
                n += 1
                s.next_speech()
                if turn.kind == "ask":
                    asked.append(turn.field or "")
                    s.hear(heard.get(turn.field or "", "yes"))
            skip_line = line("agent_skip", lang)
            spoken = [t for w, t in s.said if w == "agent"]
            if s.skipped != ["pipe_runs", "pipe_material", "home_age"]:
                problems.append(f"{lang} {said!r}: skipped {s.skipped}, expected the 3 questions")
            if spoken.count(skip_line) != 3:
                problems.append(f"{lang} {said!r}: said the move-on line {spoken.count(skip_line)} times, expected 3")
            if asked.count("pipe_material") != 1 or asked.count("pipe_runs") != 1 or asked.count("home_age") != 1:
                problems.append(f"{lang} {said!r}: re-asked a skipped question ({asked})")
            if any(f in s.answers for f in ("pipe_runs", "pipe_material", "home_age")):
                problems.append(f"{lang} {said!r}: a skipped question was recorded as an answer")
            # Unanswered counts as Medium: 3 Mediums (25+25+12.5 x 0.5) + bare pipes (12.5) = 0.4375 -> pass.
            if s.score() != 0.4375:
                problems.append(f"{lang} {said!r}: score {s.score()}, expected 0.4375 (skipped = Medium)")
    # Real answers that contain "no" or "don't know" still count as answers.
    for field, said, want in (
        ("pipe_runs", "no, they're in the garage", "outside"),
        ("pipe_material", "I don't know what they're made of... PVC I think", "pvc"),
        ("home_age", "not sure, maybe 30 years", 30),
    ):
        if read_survey(field, said) != want:
            problems.append(f"{field}: {said!r} read as {read_survey(field, said)!r}, expected {want!r}")
    if doesnt_know("no, they're in the garage") and read_survey("pipe_runs", "no, they're in the garage") is None:
        problems.append("a real answer starting with no was treated as don't know")

    # Who helps next (the team's rule): can't reach the shutoff -> "is there a neighbor who can
    # help? I can call {emergency contact}"; yes -> call them, no / none on file -> a crew.
    # Nobody home -> the emergency contact, else a crew.
    def follow(answers: dict, emergency: str) -> str | None:
        s = Survey(questions=FULL_QUESTION_KEYS, lang="en", temp=10, emergency_name=emergency)
        s.answers = dict(answers)
        return s.followup()

    cases = [
        ({**best, "shutoff_access": "cannot", "neighbor_help": True}, "Sam Lee", "contact"),
        ({**best, "shutoff_access": "cannot", "neighbor_help": False}, "Sam Lee", "crew"),
        ({**best, "shutoff_access": "cannot"}, "", "crew"),                 # nobody on file: never asked
        ({**best, "someone_home": False}, "Sam Lee", "contact"),
        ({**best, "someone_home": False}, "", "crew"),
        (best, "Sam Lee", None),
    ]
    for answers, emergency, want in cases:
        if (got := follow(answers, emergency)) != want:
            problems.append(f"followup for {answers.get('shutoff_access')}/{answers.get('neighbor_help')}/home={answers.get('someone_home')} with contact {emergency!r}: got {got}, expected {want}")

    # Full calls in each language, worst answers on a very cold night, three ways the shutoff
    # follow-up can go. "On the way" may be said only for a crew the app actually assigned.
    on_the_way = re.compile(r"on (the|their) way|va en camino|van en camino|dispatched|(help|crew|someone|neighbor|they) (is |are )?coming", re.I)
    runs = [
        # (neighbor answer, the app's crew answer, expected follow-up, expected crew)
        ("yes, please call them", "Crew 3", "contact", None),
        ("no, there isn't anyone", "Crew 3", "crew", "Crew 3"),
        ("no", None, "crew", None),
    ]
    for lang in LANGS:
        for neighbor, crew, want_follow, want_crew in runs:
            asked_crew: list[bool] = []

            def fake_assign(reasons: list[str], c: str | None = crew) -> str | None:
                asked_crew.append(True)
                return c

            s = Survey(questions=FULL_QUESTION_KEYS, lang=lang, first_name="Danish", street="Harvard St", temp=12, emergency_name="Sam Lee", assign_crew=fake_assign)
            i = 0
            while (turn := s.current) is not None:
                s.next_speech()
                if turn.kind == "ask":
                    said = {
                        "is_household": "yes",
                        "pipe_runs": "they run through the garage",
                        "pipe_material": "copper",
                        "home_age": "built in 1960",
                        "insulated": "no, they're bare",
                        "shutoff_access": "I know where it is but I can't get to it",
                        "neighbor_help": neighbor,
                        "frozen_before": "yes, it burst last winter",
                        "someone_home": "yes",
                    }.get(turn.field or "", "yes")
                    s.hear(said)
                i += 1
                if i > 50:
                    problems.append(f"{lang}: the survey never ended")
                    break
            r = s.result()
            tag = f"{lang} / neighbor {neighbor!r} / app crew {crew}"
            if r["level"] != "High" or r["followup"] != want_follow or r["crew"] != want_crew:
                problems.append(f"{tag}: got {r['level']} {r['followup']} {r['crew']}")
            if "neighbor_help" not in r["answers"]:
                problems.append(f"{tag}: never asked whether a neighbor can help")
            if bool(asked_crew) != (want_follow == "crew"):
                problems.append(f"{tag}: asked the app for a crew {len(asked_crew)} times")
            promised = any(on_the_way.search(t) for w, t in s.said if w == "agent")
            if promised != (want_crew is not None):
                problems.append(f"{tag}: 'on the way' said={promised}, but crew assigned={want_crew}")
            if len([k for k, _ in s.said if k == "agent"]) < len(FULL_QUESTION_KEYS):
                problems.append(f"{tag}: the call said too little")

    # A wrong number must not be surveyed.
    w = Survey(questions=FULL_QUESTION_KEYS, lang="en", first_name="Danish")
    w.next_speech()
    if (t := w.current) is None or t.field != "is_household":
        problems.append("a named survey does not confirm who answered")
    else:
        w.next_speech()
        w.hear("no, wrong number")
        n = 0
        while (t := w.current) is not None:
            w.next_speech()
            n += 1
            if n > 4:
                problems.append("a wrong-number survey did not end")
                break

    # The demo call: only the doc's questions 3-6, in that order, scored over those 4 alone
    # (home age and frozen before 40% each, insulation 20%); dropped questions never count.
    d = Survey(lang="en", first_name="Danish", temp=12, questions=DEMO_QUESTION_KEYS)
    asked_demo: list[str] = []
    n = 0
    while (turn := d.current) is not None and n < 40:
        n += 1
        d.next_speech()
        if turn.kind == "ask":
            asked_demo.append(turn.field or "")
            d.hear({"is_household": "yes", "home_age": "built in 1960", "insulated": "no, they're bare",
                    "shutoff_access": "yes I can turn it", "frozen_before": "no"}.get(turn.field or "", "yes"))
    if asked_demo != ["is_household", "home_age", "insulated", "shutoff_access", "frozen_before"]:
        problems.append(f"demo call asked {asked_demo}, expected identity then the 4 questions")
    if d.score() != 0.6:  # old home (1 x 0.4) + bare pipes (1 x 0.2) + never froze (0) = 0.6
        problems.append(f"demo call scored {d.score()}, expected 0.6 over its 4 questions")
    for answers, want, why in (
        ({"home_age": 5, "insulated": "yes", "frozen_before": False}, 0.0, "all Low"),
        ({"home_age": 5, "insulated": "yes", "frozen_before": True}, 0.4, "a past freeze alone passes"),
        ({"home_age": 60, "insulated": "yes", "frozen_before": True}, 0.8, "old home + past freeze fails"),
        ({"home_age": 5, "insulated": "no", "frozen_before": False}, 0.2, "bare pipes alone pass"),
        ({"home_age": 30, "insulated": "mostly", "frozen_before": False}, 0.3, "two Mediums pass"),
    ):
        sd = Survey(lang="en", temp=10, questions=DEMO_QUESTION_KEYS)
        sd.answers = dict(answers)
        if sd.score() != want:
            problems.append(f"demo score ({why}): {sd.score()}, expected {want}")

    if problems:
        print(f"{len(problems)} problem(s):")
        for p in problems:
            print(f"  - {p}")
        return 1
    print(f"survey questions checked: {len(FULL_QUESTION_KEYS)} in {len(LANGS)} languages; demo call asks {len(DEMO_QUESTION_KEYS)}")
    print(f"bands checked against the doc: {len(expect)} answers")
    print(f"weights and table rows checked: {len(rows)} combinations")
    print(f"follow-up rules checked: {len(cases)} cases")
    print(f"full surveys completed: {len(runs) * len(LANGS)} (contact / crew assigned / crew requested; 'on the way' only with a crew)")
    return 0


def demo(lang: str, temp: float | None = 19) -> int:
    s = Survey(lang=lang, first_name="Danish", street="Harvard St", temp=temp)
    print(f"--- pre-survey ({lang}) ---")
    while (turn := s.current) is not None:
        print(f"agent: {s.next_speech()}")
        if turn.kind != "ask":
            continue
        try:
            said = input("you:   ").strip()
        except EOFError:
            said = "yes"
        outcome = s.hear(said)
        if outcome == "repeat":
            print(f"agent: {s.repeat_last()}")
    r = s.result()
    print(f"\npriority: {r['level']}  score: {r['score']}  pre-survey: {'pass' if r['survey_pass'] else 'fail'}  "
          f"forecast: {r['temp_band']}  text row: {r['text_row']}  actions: {r['actions']}")
    return 0


def main(argv: list[str] | None = None) -> int:
    import argparse

    ap = argparse.ArgumentParser(description="FreezeLine pre-survey call.")
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--demo", action="store_true")
    ap.add_argument("--lang", choices=LANGS, default="en")
    ap.add_argument("--temp", type=float, default=19, help="forecast low in F (default 19, very cold)")
    a = ap.parse_args(argv)
    if a.check:
        return check()
    if a.demo:
        return demo(a.lang, a.temp)
    ap.print_help()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
