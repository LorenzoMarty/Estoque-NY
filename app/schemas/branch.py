from datetime import datetime

from app.schemas.base import SchemaBase


class BranchCreate(SchemaBase):
    name: str


class BranchOut(SchemaBase):
    id: int
    name: str
    created_at: datetime
