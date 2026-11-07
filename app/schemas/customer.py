from datetime import datetime

from pydantic import field_validator

from app.models.enums import ConsentPurpose
from app.schemas.base import SchemaBase


def _document(value: str | None) -> str | None:
    if value is None:
        return None
    clean = "".join(c for c in value if c.isalnum())
    return clean.upper() or None


def _email(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip().lower()
    if "@" not in value or " " in value:
        raise ValueError("invalid email")
    return value


class CustomerIn(SchemaBase):
    name: str
    document: str | None = None
    email: str | None = None
    phone: str | None = None

    _doc = field_validator("document")(_document)
    _mail = field_validator("email")(_email)


class CustomerPatch(SchemaBase):
    name: str | None = None
    document: str | None = None
    email: str | None = None
    phone: str | None = None

    _doc = field_validator("document")(_document)
    _mail = field_validator("email")(_email)


class ConsentIn(SchemaBase):
    purpose: ConsentPurpose
    granted: bool
    source: str


class ConsentOut(SchemaBase):
    purpose: str
    granted: bool
    source: str
    recorded_at: datetime


class CustomerOut(SchemaBase):
    id: int
    document: str | None
    name: str
    email: str | None
    phone: str | None
    created_at: datetime
    anonymized_at: datetime | None
    consents: dict[str, bool]  # current state per purpose
