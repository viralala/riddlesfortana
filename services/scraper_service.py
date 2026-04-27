from difflib import SequenceMatcher

import requests
from bs4 import BeautifulSoup


RIDDLE_SITES = [
    "https://www.riddles.com/",
    "https://parade.com/947956/parade/riddles/",
]


def check_originality(riddle_text):
    snippets = []
    for url in RIDDLE_SITES:
        try:
            response = requests.get(url, timeout=6, headers={"User-Agent": "RiddleBot/1.0"})
            response.raise_for_status()
            soup = BeautifulSoup(response.text, "html.parser")
            text = " ".join(soup.get_text(" ").split())
            snippets.append({"url": url, "text": text[:20000]})
        except Exception:
            continue

    best_score = 0.0
    best_url = None
    query = _normalize(riddle_text)
    for item in snippets:
        score = _best_similarity(query, _normalize(item["text"]))
        if score > best_score:
            best_score = score
            best_url = item["url"]

    originality_confidence = max(0.0, 1.0 - best_score)
    return {
        "confidence": round(originality_confidence, 4),
        "similarity": round(best_score, 4),
        "matched_url": best_url,
        "sources_checked": [item["url"] for item in snippets],
    }


def _normalize(text):
    return " ".join("".join(ch.lower() if ch.isalnum() else " " for ch in text).split())


def _best_similarity(query, corpus):
    if not query or not corpus:
        return 0.0
    if query in corpus:
        return 1.0

    words = corpus.split()
    q_len = max(8, len(query.split()))
    best = 0.0
    for i in range(0, max(1, len(words) - q_len), max(1, q_len // 2)):
        window = " ".join(words[i : i + q_len])
        best = max(best, SequenceMatcher(None, query, window).ratio())
        if best > 0.95:
            break
    return best
