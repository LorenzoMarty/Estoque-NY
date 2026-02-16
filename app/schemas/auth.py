from datetime import datetime

from pydantic import Field

from app.schemas.base import SchemaBase


class UserRegisterIn(SchemaBase):
    name: str = Field(min_length=1, max_length=120)
    email: str
    password: str = Field(min_length=8, max_length=120)


class UserLoginIn(SchemaBase):
    email: str
    password: str


class TokenPairOut(SchemaBase):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshTokenIn(SchemaBase):
    refresh_token: str


class UserOut(SchemaBase):
    id: int
    name: str
    email: str
    active: bool
    created_at: datetime


class AssignRoleIn(SchemaBase):
    user_id: int
    role_name: str
