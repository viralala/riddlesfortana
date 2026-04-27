from difflib import SequenceMatcher

try:
    import spacy
except Exception:  # pragma: no cover - handled at runtime
    spacy = None


class NLPService:
    def __init__(self, threshold=0.75):
        self.threshold = threshold
        self.model_name = None
        self.nlp = self._load_model()

    def _load_model(self):
        if not spacy:
            return None
        for model_name in ("en_core_web_md", "en_core_web_sm"):
            try:
                self.model_name = model_name
                return spacy.load(model_name)
            except Exception:
                continue
        return None

    def validate(self, user_answer, correct_answer):
        score = self.similarity(user_answer, correct_answer)
        return {
            "accepted": score >= self.threshold,
            "score": round(score, 4),
            "threshold": self.threshold,
            "model": self.model_name or "fallback",
        }

    def similarity(self, a, b):
        a_norm = self._normalize(a)
        b_norm = self._normalize(b)
        if not a_norm or not b_norm:
            return 0.0
        if a_norm == b_norm or b_norm in a_norm:
            return 1.0

        if self.nlp:
            doc_a = self.nlp(a_norm)
            doc_b = self.nlp(b_norm)
            if doc_a.vector_norm and doc_b.vector_norm:
                return float(doc_a.similarity(doc_b))

        return max(self._sequence_score(a_norm, b_norm), self._token_overlap(a_norm, b_norm))

    @staticmethod
    def _normalize(text):
        return " ".join("".join(ch.lower() if ch.isalnum() else " " for ch in text).split())

    @staticmethod
    def _sequence_score(a, b):
        return SequenceMatcher(None, a, b).ratio()

    @staticmethod
    def _token_overlap(a, b):
        a_tokens = set(a.split())
        b_tokens = set(b.split())
        if not a_tokens or not b_tokens:
            return 0.0
        return len(a_tokens & b_tokens) / len(b_tokens)


nlp_service = NLPService()
