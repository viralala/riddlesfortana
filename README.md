# Riddle Me This

Flask backend version of the vanilla HTML/CSS/JavaScript riddle game.

## Local Run

```powershell
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Open `http://127.0.0.1:5000`.

## Required Environment Variables

Copy `.env.example` and configure production secrets in your hosting provider.

- `FLASK_SECRET_KEY`
- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `FIREBASE_DATABASE_URL`
- `OPENAI_API_KEY`
- SMTP variables for email notifications

If Firebase is not configured, the app uses an in-memory fallback so the UI can still run, but data will not persist across server restarts.

## Vercel

The project includes `vercel.json` and `.vercelignore`. Deploy from the project root with Vercel or connect this repo in the Vercel dashboard.
