import hashlib
import json
from dataclasses import dataclass
from typing import Any

from fastapi import HTTPException, Request, status
from fastapi.encoders import jsonable_encoder
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError

from app.core.db import get_sessionmaker
from app.core.settings import get_settings
from app.models.entities import IdempotencyKey

PROCESSING_STATUS_CODE = 0


@dataclass
class IdempotencyState:
    key: str | None
    route: str | None
    request_hash: str | None
    replay_response: Any | None = None
    replay_status_code: int | None = None

    @property
    def is_replay(self) -> bool:
        return self.replay_status_code is not None


def _payload_hash(payload: Any) -> str:
    canonical = json.dumps(
        jsonable_encoder(payload),
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _is_production() -> bool:
    env = get_settings().app_env.lower()
    return env in {"prod", "production"}


async def begin_idempotency(
    request: Request,
    payload: Any,
) -> IdempotencyState:
    settings = get_settings()
    key = request.headers.get("Idempotency-Key")
    if settings.idempotency_required_in_production and _is_production() and not key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Idempotency-Key header is required",
        )

    if not key:
        return IdempotencyState(key=None, route=None, request_hash=None)

    route = f"{request.method}:{request.url.path}"
    request_hash = _payload_hash(payload)
    sessionmaker = get_sessionmaker()

    async with sessionmaker() as session:
        record = IdempotencyKey(
            key=key,
            route=route,
            request_hash=request_hash,
            response_body={},
            status_code=PROCESSING_STATUS_CODE,
        )
        session.add(record)
        try:
            await session.commit()
        except IntegrityError as exc:
            await session.rollback()
            existing = await session.scalar(
                select(IdempotencyKey).where(
                    IdempotencyKey.key == key,
                    IdempotencyKey.route == route,
                )
            )
            if existing is None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="idempotency conflict",
                ) from exc
            if existing.request_hash != request_hash:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Idempotency-Key reused with different payload",
                ) from exc
            if existing.status_code == PROCESSING_STATUS_CODE:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Request with same Idempotency-Key is in progress",
                ) from exc
            return IdempotencyState(
                key=key,
                route=route,
                request_hash=request_hash,
                replay_response=existing.response_body,
                replay_status_code=existing.status_code,
            )

    return IdempotencyState(key=key, route=route, request_hash=request_hash)


async def finish_idempotency(
    state: IdempotencyState,
    *,
    status_code: int,
    response_body: Any,
) -> None:
    if state.key is None or state.route is None or state.request_hash is None:
        return

    sessionmaker = get_sessionmaker()
    async with sessionmaker() as session:
        record = await session.scalar(
            select(IdempotencyKey).where(
                IdempotencyKey.key == state.key,
                IdempotencyKey.route == state.route,
                IdempotencyKey.request_hash == state.request_hash,
            )
        )
        if record is None:
            return

        record.status_code = status_code
        record.response_body = jsonable_encoder(response_body)
        await session.commit()


async def abort_idempotency(state: IdempotencyState) -> None:
    if state.key is None or state.route is None or state.request_hash is None:
        return

    sessionmaker = get_sessionmaker()
    async with sessionmaker() as session:
        await session.execute(
            delete(IdempotencyKey).where(
                IdempotencyKey.key == state.key,
                IdempotencyKey.route == state.route,
                IdempotencyKey.request_hash == state.request_hash,
                IdempotencyKey.status_code == PROCESSING_STATUS_CODE,
            )
        )
        await session.commit()
