import logging

from app.core.config import get_settings

_LOGGING_CONFIGURED = False


class _RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if not hasattr(record, "request_id"):
            record.request_id = "-"
        return True


def configure_logging() -> None:
    global _LOGGING_CONFIGURED
    if _LOGGING_CONFIGURED:
        return

    settings = get_settings()
    logging.basicConfig(
        level=getattr(logging, settings.log_level.upper(), logging.INFO),
        format=(
            "%(asctime)s | %(levelname)s | %(name)s | "
            "request_id=%(request_id)s | %(message)s"
        ),
    )
    request_id_filter = _RequestIdFilter()
    root_logger = logging.getLogger()
    root_logger.addFilter(request_id_filter)
    for handler in root_logger.handlers:
        handler.addFilter(request_id_filter)

    # Keep uvicorn loggers aligned with app log level.
    for logger_name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        logger = logging.getLogger(logger_name)
        logger.setLevel(getattr(logging, settings.log_level.upper(), logging.INFO))
        logger.addFilter(request_id_filter)
        for handler in logger.handlers:
            handler.addFilter(request_id_filter)

    _LOGGING_CONFIGURED = True
