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

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from script import (  # noqa: E402  (path set above so this works from anywhere)
    LANGS,
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

# The five questions, in the doc's order.
QUESTION_KEYS = (
    "q_pipe_runs",
    "q_insulated",
    "q_shutoff_access",
    "q_frozen_before",
    "q_someone_home",
)
FIELDS = ("pipe_runs", "insulated", "shutoff_access", "frozen_before", "someone_home")
FIELD_OF = {
    "q_pipe_runs": "pipe_runs",
    "q_insulated": "insulated",
    "q_shutoff_access": "shutoff_access",
    "q_frozen_before": "frozen_before",
    "q_someone_home": "someone_home",
    "q_is_you": "is_household",
    "q_sees_list": "sees_list",
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

SHUTOFF_CANNOT = ("cant", "cannot", "can not", "not able", "unable", "hard to", "too heavy", "too low", "no puedo", "dificil")
SHUTOFF_OK = ("i can", "can get", "reach it", "get to it", "turn it", "i know where", "easy", "puedo", "llego", "cierro")


def read_survey(field: str, text: str) -> object:
    """The doc's answer for one question, from whatever the person actually said."""
    t = normalise(text)
    if not t:
        return None
    if field == "pipe_runs":
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
    if field == "shutoff_access":
        if any(w in t for w in SHUTOFF_CANNOT):
            return "cannot"
        if any(w in t for w in SHUTOFF_OK):
            return "ok"
        a = classify(text)
        return "ok" if a else ("cannot" if a is False else None)
    if field in ("frozen_before", "someone_home"):
        return classify(text)
    return None


def band_of(field: str, value: object) -> str:
    """The risk band the doc gives one answer. Unknown is medium: never quietly low."""
    if field == "pipe_runs":
        return {"interior": "low", "slab": "medium", "outside": "high"}.get(str(value), "medium")
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
    ) -> None:
        if lang not in LANGS:
            raise ValueError(f"lang must be one of {LANGS}")
        self.lang = lang
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
        for key in QUESTION_KEYS:
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
        self.turns.append(self._say({"Low": "survey_low", "Medium": "survey_medium", "High": "survey_high"}[self.level()]))
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
        else:
            answer = read_survey(field, transcript)

        if answer is None and self.attempts < 1:
            self.attempts += 1
            self.turns.insert(self.i, self._say("agent_didnt_catch"))
            return "unclear"

        self.attempts = 0
        self.i += 1

        if field == "is_household" and answer is False:
            self.turns = self.turns[: self.i]
            self.turns.append(self._say("agent_wrong_number"))
            self.ended = True
            return "ok"
        if field == "sees_list":
            self.sees_list = answer
            self.turns.append(self._say("agent_list_confirmed" if answer else "agent_list_resend"))
            return "ok"
        if field in FIELDS:
            self.answers[field] = answer
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

    def level(self) -> str:
        """The worst band of the five answers, which is the home's band."""
        worst = 0
        for field in FIELDS:
            if field not in self.answers:
                continue
            worst = max(worst, SEVERITY[band_of(field, self.answers[field])])
        return BAND_NAME[worst]

    def result(self) -> dict:
        return {
            "mode": "survey",
            "level": self.level(),
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
    keys = (*QUESTION_KEYS, "q_is_you", "survey_low", "survey_medium", "survey_high", "survey_text_pending")
    for key in keys:
        for lang in LANGS:
            if not pack.get(key, {}).get(lang):
                problems.append(f"missing call.{key}.{lang}")

    # The doc's bands, answer by answer.
    expect = [
        ("pipe_runs", "inside the walls in a heated space", "low"),
        ("pipe_runs", "under the concrete slab", "medium"),
        ("pipe_runs", "they run through the garage and basement", "high"),
        ("insulated", "yes, all insulated", "low"),
        ("insulated", "mostly", "medium"),
        ("insulated", "no, they're bare", "high"),
        ("shutoff_access", "yes I know where it is and I can turn it", "low"),
        ("shutoff_access", "I know where it is but I can't turn it", "high"),
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

    # A full survey in each language, worst answers, must end at High and stay honest.
    for lang in LANGS:
        s = Survey(lang=lang, first_name="Danish", street="Harvard St")
        i = 0
        while (turn := s.current) is not None:
            s.next_speech()
            if turn.kind == "ask":
                said = {
                    "is_household": "yes",
                    "pipe_runs": "they run through the garage",
                    "insulated": "no, they're bare",
                    "shutoff_access": "I can't turn it",
                    "frozen_before": "yes, it burst last winter",
                    "someone_home": "no, we're leaving",
                }.get(turn.field or "", "yes")
                s.hear(said)
            i += 1
            if i > 30:
                problems.append(f"{lang}: the survey never ended")
                break
        if s.result()["level"] != "High":
            problems.append(f"{lang}: expected High, got {s.result()['level']}")

    # A wrong number must not be surveyed.
    w = Survey(lang="en", first_name="Danish")
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

    if problems:
        print(f"{len(problems)} problem(s):")
        for p in problems:
            print(f"  - {p}")
        return 1
    print(f"survey questions checked: {len(QUESTION_KEYS)} in {len(LANGS)} languages")
    print(f"bands checked against the doc: {len(expect)} answers")
    print("full surveys completed: 2 (both High)")
    return 0


def demo(lang: str) -> int:
    s = Survey(lang=lang, first_name="Danish", street="Harvard St")
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
    print(f"\nlevel: {r['level']}  bands: {r['bands']}")
    return 0


def main(argv: list[str] | None = None) -> int:
    import argparse

    ap = argparse.ArgumentParser(description="FreezeLine pre-survey call.")
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--demo", action="store_true")
    ap.add_argument("--lang", choices=LANGS, default="en")
    a = ap.parse_args(argv)
    if a.check:
        return check()
    if a.demo:
        return demo(a.lang)
    ap.print_help()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
