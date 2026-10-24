import re
from datetime import datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import Field, field_validator

from app.schemas.base import SchemaBase

WEEKDAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
_HOURS = re.compile(r"^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$")


class BranchBase(SchemaBase):
    name: str = Field(min_length=1, max_length=120)
    # Public store profile; omitted fields are left untouched on update.
    public_name: str | None = Field(default=None, max_length=120)
    address: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=40)
    opening_hours: dict[str, str | None] | None = None
    timezone: str | None = Field(default=None, max_length=64)

    @field_validator("public_name", "address", "phone")
    @classmethod
    def blank_to_none(cls, value: str | None) -> str | None:
        return " ".join(value.split()) or None if value else None

    @field_validator("opening_hours")
    @classmethod
    def check_hours(cls, value: dict[str, str | None] | None):
        """Weekday -> "HH:MM-HH:MM", or null for closed."""
        if value is None:
            return None
        for day, span in value.items():
            if day not in WEEKDAYS:
                raise ValueError(f"unknown weekday {day!r}")
            if span is not None and not _HOURS.match(span):
                raise ValueError(f"{day}: use HH:MM-HH:MM or null")
        return value

    @field_validator("timezone")
    @classmethod
    def check_timezone(cls, value: str | None) -> str | None:
        if value:
            try:
                ZoneInfo(value)
            except (ZoneInfoNotFoundError, ValueError) as exc:
                raise ValueError("unknown IANA time zone") from exc
        return value or None

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        normalized = " ".join(value.split())
        if not normalized:
            raise ValueError("name cannot be empty")
        return normalized


class BranchCreate(BranchBase):
    pass


class BranchUpdate(BranchBase):
    pass


class BranchOut(SchemaBase):
    id: int
    name: str
    public_name: str | None
    address: str | None
    phone: str | None
    opening_hours: dict[str, str | None] | None
    timezone: str | None
    created_at: datetime


class BranchListOut(SchemaBase):
    items: list[BranchOut]
    meta: dict[str, int | None]
