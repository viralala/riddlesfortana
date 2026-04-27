from flask import Blueprint, jsonify, request, session

from services.email_service import send_finish_email, send_leaderboard_email
from services.firebase_service import firebase_service
from services.nlp_service import nlp_service
from services.openai_service import generate_riddle
from services.riddle_service import riddle_service
from services.scraper_service import check_originality

api_bp = Blueprint("api", __name__, url_prefix="/api")


def json_body():
    return request.get_json(silent=True) or {}


@api_bp.post("/session/start")
def start_session():
    payload = json_body()
    session_key = payload.get("session_key") or firebase_service.new_session_key()
    session["session_key"] = session_key
    return jsonify({"session_key": session_key})


@api_bp.get("/riddle/<int:riddle_id>")
def get_riddle(riddle_id):
    pack = request.args.get("pack", "classic")
    riddle = riddle_service.get_public_riddle(pack, riddle_id)
    if not riddle:
        return jsonify({"error": "Riddle not found"}), 404
    return jsonify(riddle)


@api_bp.post("/validate-answer")
def validate_answer():
    payload = json_body()
    pack = payload.get("pack", "classic")
    riddle_id = int(payload.get("riddle_id", 0))
    user_answer = (payload.get("answer") or "").strip()

    if not user_answer:
        return jsonify({"accepted": False, "score": 0.0, "error": "Answer is required"}), 400

    riddle = riddle_service.get_private_riddle(pack, riddle_id)
    correct_answer = (riddle or {}).get("answer") or payload.get("correct_answer")
    if not correct_answer:
        return jsonify({"accepted": False, "score": 0.0, "error": "Correct answer unavailable"}), 404

    result = nlp_service.validate(user_answer, correct_answer)
    return jsonify(result)


@api_bp.post("/guess")
def record_guess():
    payload = json_body()
    session_key = payload.get("session_key") or session.get("session_key") or firebase_service.new_session_key()
    entry = {
        "type": payload.get("type", "info"),
        "riddleNum": payload.get("riddle_num") or payload.get("riddleNum"),
        "diff": payload.get("diff", ""),
        "guess": payload.get("guess", ""),
        "pack": payload.get("pack", "classic"),
        "ts": payload.get("ts") or firebase_service.now_ms(),
    }
    firebase_service.push_guess(session_key, entry)

    if entry["type"] == "finished":
        send_finish_email(entry)

    return jsonify({"ok": True, "session_key": session_key, "entry": entry})


@api_bp.get("/leaderboard")
def get_leaderboard():
    return jsonify({"entries": firebase_service.get_leaderboard()})


@api_bp.post("/leaderboard")
def add_leaderboard_entry():
    payload = json_body()
    entry = {
        "name": (payload.get("name") or "Anonymous")[:24],
        "lives": int(payload.get("lives") or 0),
        "time": int(payload.get("time") or 0),
        "mode": payload.get("mode", "normal"),
        "pack": payload.get("pack", "classic"),
        "date": payload.get("date") or firebase_service.now_ms(),
    }
    entries = firebase_service.add_leaderboard_entry(entry)
    send_leaderboard_email(entry)
    return jsonify({"ok": True, "entry": entry, "entries": entries})


@api_bp.post("/generate-riddle")
def generate_riddle_endpoint():
    payload = json_body()
    theme = (payload.get("theme") or "").strip()
    if not theme:
        return jsonify({"error": "Theme is required"}), 400
    result, status = generate_riddle(theme)
    return jsonify(result), status


@api_bp.post("/check-originality")
def check_originality_endpoint():
    payload = json_body()
    text = (payload.get("text") or payload.get("riddle") or "").strip()
    if not text:
        return jsonify({"error": "Riddle text is required"}), 400
    result = check_originality(text)
    return jsonify(result)


# Compatibility API used by the migrated frontend where Firebase was previously
# called directly from app.js. These keep the UI behavior intact while secrets
# and persistence live on the server.
@api_bp.get("/firebase/get")
def firebase_get():
    path = request.args.get("path", "/")
    return jsonify(firebase_service.get_path(path))


@api_bp.post("/firebase/set")
def firebase_set():
    payload = json_body()
    firebase_service.set_path(payload.get("path", "/"), payload.get("data"))
    return jsonify({"ok": True})


@api_bp.post("/firebase/push")
def firebase_push():
    payload = json_body()
    key = firebase_service.push_path(payload.get("path", "/"), payload.get("data"))
    return jsonify({"ok": True, "key": key})
