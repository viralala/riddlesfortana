import json
import os

try:
    from openai import OpenAI
except Exception:  # pragma: no cover - handled at runtime
    OpenAI = None


def generate_riddle(theme):
    if not OpenAI or not os.getenv("OPENAI_API_KEY"):
        return {"error": "OpenAI is not configured. Set OPENAI_API_KEY."}, 503

    client = OpenAI()
    prompt = (
        "Create one original riddle. Return only JSON with keys "
        "question, answer, hint, difficulty. Theme: "
        f"{theme}"
    )

    try:
        response = client.chat.completions.create(
            model=os.getenv("OPENAI_RIDDLE_MODEL", "gpt-4o-mini"),
            messages=[
                {"role": "system", "content": "You write concise, fair, original riddles."},
                {"role": "user", "content": prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.8,
        )
        content = response.choices[0].message.content
        data = json.loads(content)
        return {
            "question": data.get("question", ""),
            "answer": data.get("answer", ""),
            "hint": data.get("hint", ""),
            "difficulty": data.get("difficulty", "medium"),
        }, 200
    except Exception as exc:
        return {"error": f"OpenAI generation failed: {exc}"}, 502
