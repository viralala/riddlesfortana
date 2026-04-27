import os
import time
import uuid
from copy import deepcopy

try:
    import firebase_admin
    from firebase_admin import credentials, db
except Exception:  # pragma: no cover - handled at runtime
    firebase_admin = None
    credentials = None
    db = None


class FirebaseService:
    def __init__(self):
        self._memory = {}
        self._enabled = False
        self._init_admin()

    def _init_admin(self):
        cred_path = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")
        db_url = os.getenv("FIREBASE_DATABASE_URL")
        if not firebase_admin or not cred_path or not db_url:
            return

        try:
            if not firebase_admin._apps:
                cred = credentials.Certificate(cred_path)
                firebase_admin.initialize_app(cred, {"databaseURL": db_url})
            self._enabled = True
        except Exception as exc:
            print(f"Firebase Admin disabled: {exc}")
            self._enabled = False

    @staticmethod
    def now_ms():
        return int(time.time() * 1000)

    @staticmethod
    def new_session_key():
        return f"sess_{int(time.time() * 1000)}_{uuid.uuid4().hex[:7]}"

    def _clean_path(self, path):
        return "/" + str(path or "/").strip("/")

    def _ref(self, path):
        return db.reference(self._clean_path(path))

    def get_path(self, path):
        path = self._clean_path(path)
        if self._enabled:
            return self._ref(path).get()
        return deepcopy(self._get_memory(path))

    def set_path(self, path, data):
        path = self._clean_path(path)
        if self._enabled:
            self._ref(path).set(data)
            return
        self._set_memory(path, data)

    def push_path(self, path, data):
        path = self._clean_path(path)
        if self._enabled:
            return self._ref(path).push(data).key
        key = f"entry_{uuid.uuid4().hex[:12]}"
        current = self._get_memory(path)
        if not isinstance(current, dict):
            current = {}
        current[key] = data
        self._set_memory(path, current)
        return key

    def push_guess(self, session_key, entry):
        return self.push_path(f"/guesses/{session_key}", entry)

    def get_leaderboard(self):
        entries = []
        stored = self.get_path("/leaderboard")
        if isinstance(stored, dict):
            entries.extend(v for v in stored.values() if isinstance(v, dict))
        elif isinstance(stored, list):
            entries.extend(v for v in stored if isinstance(v, dict))

        pushed = self.get_path("/leaderboard_entries")
        if isinstance(pushed, dict):
            entries.extend(v for v in pushed.values() if isinstance(v, dict))

        seen = set()
        deduped = []
        for entry in entries:
            key = (entry.get("name"), entry.get("time"), entry.get("date"))
            if key in seen:
                continue
            seen.add(key)
            deduped.append(entry)

        deduped.sort(key=lambda e: (-int(e.get("lives") or 0), int(e.get("time") or 0)))
        return deduped[:20]

    def add_leaderboard_entry(self, entry):
        self.push_path("/leaderboard_entries", entry)
        entries = self.get_leaderboard()
        self.set_path("/leaderboard", {f"entry_{idx}": item for idx, item in enumerate(entries)})
        return entries

    def _parts(self, path):
        return [part for part in path.strip("/").split("/") if part]

    def _get_memory(self, path):
        cursor = self._memory
        for part in self._parts(path):
            if not isinstance(cursor, dict) or part not in cursor:
                return None
            cursor = cursor[part]
        return cursor

    def _set_memory(self, path, data):
        parts = self._parts(path)
        if not parts:
            self._memory = data if isinstance(data, dict) else {}
            return

        cursor = self._memory
        for part in parts[:-1]:
            cursor = cursor.setdefault(part, {})

        if data is None:
            cursor.pop(parts[-1], None)
        else:
            cursor[parts[-1]] = data


firebase_service = FirebaseService()
