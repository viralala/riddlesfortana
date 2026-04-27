import ast
import re
from pathlib import Path


class RiddleService:
    PACKS = {
        "classic": "RIDDLES_CLASSIC",
        "harrypotter": "RIDDLES_HP",
        "horror": "RIDDLES_HORROR",
    }

    def __init__(self):
        self._packs = None

    def get_public_riddle(self, pack, riddle_id):
        riddle = self.get_private_riddle(pack, riddle_id)
        if not riddle:
            return None
        public = dict(riddle)
        public.pop("answers", None)
        public.pop("answer", None)
        return public

    def get_private_riddle(self, pack, riddle_id):
        riddles = self._load_packs().get(pack) or self._load_packs().get("classic", [])
        if riddle_id < 0 or riddle_id >= len(riddles):
            return None
        return riddles[riddle_id]

    def _load_packs(self):
        if self._packs is not None:
            return self._packs

        app_js = Path(__file__).resolve().parents[1] / "static" / "app.js"
        source = app_js.read_text(encoding="utf-8", errors="ignore")
        self._packs = {}
        for pack, var_name in self.PACKS.items():
            block = self._extract_array(source, var_name)
            self._packs[pack] = self._parse_riddles(block)
        return self._packs

    def _extract_array(self, source, var_name):
        marker = f"var {var_name} = ["
        start = source.find(marker)
        if start == -1:
            return ""
        idx = source.find("[", start)
        depth = 0
        in_string = None
        escaped = False
        for pos in range(idx, len(source)):
            ch = source[pos]
            if in_string:
                if escaped:
                    escaped = False
                elif ch == "\\":
                    escaped = True
                elif ch == in_string:
                    in_string = None
            else:
                if ch in ("'", '"'):
                    in_string = ch
                elif ch == "[":
                    depth += 1
                elif ch == "]":
                    depth -= 1
                    if depth == 0:
                        return source[idx + 1 : pos]
        return ""

    def _parse_riddles(self, block):
        objects = self._split_objects(block)
        riddles = []
        for idx, obj in enumerate(objects):
            answers = self._parse_answers(obj)
            riddles.append(
                {
                    "id": idx,
                    "diff": self._field(obj, "diff"),
                    "diffClass": self._field(obj, "diffClass"),
                    "question": self._field(obj, "question"),
                    "hint": self._field(obj, "hint"),
                    "explain": self._field(obj, "explain"),
                    "answers": answers,
                    "answer": answers[0] if answers else "",
                }
            )
        return riddles

    def _split_objects(self, block):
        objects = []
        depth = 0
        start = None
        in_string = None
        escaped = False
        for idx, ch in enumerate(block):
            if in_string:
                if escaped:
                    escaped = False
                elif ch == "\\":
                    escaped = True
                elif ch == in_string:
                    in_string = None
            else:
                if ch in ("'", '"'):
                    in_string = ch
                elif ch == "{":
                    if depth == 0:
                        start = idx
                    depth += 1
                elif ch == "}":
                    depth -= 1
                    if depth == 0 and start is not None:
                        objects.append(block[start : idx + 1])
                        start = None
        return objects

    def _field(self, obj, name):
        match = re.search(rf"{name}\s*:\s*([\"'])((?:\\.|(?!\1).)*)\1", obj, re.S)
        if not match:
            return ""
        return bytes(match.group(2), "utf-8").decode("unicode_escape")

    def _parse_answers(self, obj):
        match = re.search(r"answers\s*:\s*\[(.*?)\]", obj, re.S)
        if not match:
            return []
        values = re.findall(r'"(?:\\.|[^"])*"', match.group(1))
        answers = []
        for value in values:
            try:
                answers.append(ast.literal_eval(value))
            except Exception:
                pass
        return answers


riddle_service = RiddleService()
