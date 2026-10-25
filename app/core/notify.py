import asyncio
import logging
import smtplib
from email.message import EmailMessage

from app.core.settings import get_settings

logger = logging.getLogger("app.notify")


def _send(subject: str, body: str) -> None:
    settings = get_settings()
    assert settings.smtp_host  # checked by send_email
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = settings.smtp_from
    message["To"] = settings.alert_email_to
    message.set_content(body)
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as smtp:
        smtp.ehlo()
        if smtp.has_extn("starttls"):
            smtp.starttls()
            smtp.ehlo()
        if settings.smtp_user and settings.smtp_password:
            smtp.login(settings.smtp_user, settings.smtp_password)
        smtp.send_message(message)


def email_configured() -> bool:
    settings = get_settings()
    return bool(settings.smtp_host and settings.alert_email_to)


async def send_email(subject: str, body: str) -> bool:
    """E-mail the alert recipient; False (and a log line) when SMTP is not configured.

    Failures are logged, not raised: the alert is also in the log and a mail outage
    must not stop the job from recording that it ran.
    """
    if not email_configured():
        logger.info("e-mail not configured; alert only logged")
        return False
    try:
        await asyncio.to_thread(_send, subject, body)
    except Exception:
        logger.exception("could not send alert e-mail")
        return False
    return True
