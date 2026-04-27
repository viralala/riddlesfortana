import os
import smtplib
import threading
from email.message import EmailMessage


def send_finish_email(entry):
    subject = "Riddle run completed"
    body = f"A player finished the riddle run.\n\nDetails:\n{entry}"
    _send_async(subject, body)


def send_leaderboard_email(entry):
    subject = "New leaderboard entry"
    body = (
        f"{entry.get('name')} entered the leaderboard.\n\n"
        f"Lives: {entry.get('lives')}\n"
        f"Time: {entry.get('time')} ms\n"
        f"Mode: {entry.get('mode')}\n"
        f"Pack: {entry.get('pack')}"
    )
    _send_async(subject, body)


def _send_async(subject, body):
    thread = threading.Thread(target=_send_email, args=(subject, body), daemon=True)
    thread.start()


def _send_email(subject, body):
    host = os.getenv("SMTP_HOST")
    port = int(os.getenv("SMTP_PORT", "587"))
    username = os.getenv("SMTP_USERNAME")
    password = os.getenv("SMTP_PASSWORD")
    sender = os.getenv("EMAIL_FROM", username or "")
    recipient = os.getenv("EMAIL_TO")

    if not all([host, sender, recipient]):
        return

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = sender
    message["To"] = recipient
    message.set_content(body)

    try:
        with smtplib.SMTP(host, port, timeout=10) as smtp:
            smtp.starttls()
            if username and password:
                smtp.login(username, password)
            smtp.send_message(message)
    except Exception as exc:
        print(f"Email send failed: {exc}")
