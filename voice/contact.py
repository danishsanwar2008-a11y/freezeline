"""The call to a household's emergency contact (from their /register sign-up).

Placed by the web app right after a pre-survey call that needs someone at the house: the
homeowner can't get to their water shutoff (and said yes, call my emergency contact), or nobody
will be home for three days. One question: can you go over and help? Yes -> the app texts them the
address and the steps. No, no answer, or a hang-up -> the app assigns a crew instead.

Same interface as voice/survey.py's Survey, so voice/agent.py drives it turn by turn. Every word
comes from data/messages.json `call`; nothing here promises a crew.

  python voice/contact.py --check
"""

from __future__ import annotations

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from script import LANGS, Turn, classify, classify_for, line, wants_repeat  # noqa: E402

FIELD_OF = {"q_is_you": "is_contact", "q_contact_can_help": "can_help"}


class ContactCall:
    def __init__(self, lang: str = "en", contact_name: str = "", homeowner: str = "", reasons: list[str] | None = None) -> None:
        if lang not in LANGS:
            raise ValueError(f"lang must be one of {LANGS}")
        self.lang = lang
        self.contact_name = contact_name.strip()
        self.first_name = self.contact_name.split(" ")[0] if self.contact_name else ""
        self.homeowner = homeowner.strip() or ("your neighbor" if lang == "en" else "su vecino")
        self.reasons = [r for r in (reasons or []) if r in ("shutoff", "away")] or ["shutoff"]
        self.answers: dict[str, object] = {}
        self.ended = False
        self.closed = False
        self.attempts = 0
        self.i = 0
        self.said: list[tuple[str, str]] = []
        self.turns: list[Turn] = []
        self.turns.append(self._say("contact_hello", {"contact_name": self.first_name or self.contact_name}))
        if self.first_name:
            self.turns.append(self._ask("q_is_you", {"first_name": self.first_name}))
        self.turns.append(self._say(f"contact_reason_{self.reasons[0]}", {"homeowner": self.homeowner}))
        self.turns.append(self._ask("q_contact_can_help"))

    def _say(self, key: str, params: dict[str, object] | None = None) -> Turn:
        return Turn("say", key, line(key, self.lang, params))

    def _ask(self, key: str, params: dict[str, object] | None = None) -> Turn:
        return Turn("ask", key, line(key, self.lang, params), FIELD_OF[key])

    @property
    def current(self) -> Turn | None:
        if not self.ended and not self.closed and self.i >= len(self.turns):
            self.closed = True
            can = self.answers.get("can_help")
            self.turns.append(self._say("contact_yes" if can is True else "contact_no"))
        return self.turns[self.i] if self.i < len(self.turns) else None

    def speech_speed(self) -> float:
        return 1.0

    def hear(self, transcript: str) -> str:
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
        answer = classify_for("is_household", transcript, self.first_name) if field == "is_contact" else classify(transcript)
        if answer is None and self.attempts < 2:
            self.attempts += 1
            self.turns.insert(self.i, self._say("agent_didnt_catch"))
            return "unclear"
        self.attempts = 0
        self.i += 1
        if field == "is_contact" and answer is False:
            self.turns = self.turns[: self.i]
            self.turns.append(self._say("agent_wrong_number"))
            self.ended = True
            return "ok"
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

    def result(self) -> dict:
        return {
            "mode": "contact",
            "answers": {k: v for k, v in self.answers.items() if k == "can_help"},
            "lang": self.lang,
            "transcript": [{"who": w, "text": t} for w, t in self.said],
        }


def check() -> int:
    import re

    problems: list[str] = []
    on_the_way = re.compile(r"on (the|their) way|va en camino|dispatched|(help|crew|someone) (is |are )?coming", re.I)
    for lang in LANGS:
        for reasons, said, want in ((["shutoff"], "yes, I can go", True), (["away"], "no, I'm out of town", False)):
            c = ContactCall(lang=lang, contact_name="Sam Lee", homeowner="Danish", reasons=reasons)
            n = 0
            while (t := c.current) is not None:
                c.next_speech()
                if t.kind == "ask":
                    c.hear("yes" if t.field == "is_contact" else said)
                n += 1
                if n > 15:
                    problems.append(f"{lang}: contact call never ended")
                    break
            if c.result()["answers"].get("can_help") is not want:
                problems.append(f"{lang} {reasons}: expected can_help {want}")
            if any(on_the_way.search(x) for w, x in c.said if w == "agent"):
                problems.append(f"{lang}: a contact-call line promises help on its way")
    w = ContactCall(lang="en", contact_name="Sam Lee", homeowner="Danish")
    w.next_speech()
    w.next_speech()
    w.hear("no, wrong number")
    if not w.ended or "can_help" in w.answers:
        problems.append("a wrong number must end the call without an answer")
    if problems:
        print("\n".join(problems))
        return 1
    print("contact calls checked: 4 (yes / no, both languages), wrong number ends the call")
    return 0


if __name__ == "__main__":
    raise SystemExit(check() if "--check" in sys.argv else 0)
