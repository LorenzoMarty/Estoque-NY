import os
import subprocess
import sys
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.core.password_policy import password_problems
from app.db.session import get_sessionmaker
from app.models.entities import User
from tests.helpers import register_and_login

GOOD = "Password123!"


async def _user(email: str) -> User:
    async with get_sessionmaker()() as session:
        return await session.scalar(select(User).where(User.email == email))


async def _update_user(email: str, **fields) -> None:
    async with get_sessionmaker()() as session:
        user = await session.scalar(select(User).where(User.email == email))
        for key, value in fields.items():
            setattr(user, key, value)
        await session.commit()


async def _login(client, email="admin@example.com", password=GOOD):
    return await client.post("/auth/login", json={"email": email, "password": password})


# --- policy ---------------------------------------------------------------


@pytest.mark.parametrize(
    "password, expected",
    [
        ("Password123!", []),
        ("short1", ["at least 10 characters"]),
        ("onlyletterspassword", ["at least one letter and one digit"]),
        ("12345678901234", ["at least one letter and one digit"]),
        (
            "1234567890",
            ["at least one letter and one digit", "not a commonly used password"],
        ),
    ],
)
def test_password_problems(password, expected):
    assert password_problems(password) == expected


def test_password_must_not_contain_email_name():
    assert password_problems("maria.silva2026", email="maria.silva@loja.com") == [
        "must not contain the e-mail name"
    ]
    assert password_problems("Another-Pass-77", email="maria.silva@loja.com") == []


# --- register / change password -----------------------------------------


@pytest.mark.asyncio
async def test_register_rejects_weak_passwords(client):
    response = await client.post(
        "/auth/register",
        json={"name": "A", "email": "a@example.com", "password": "weakpass1"},
    )

    assert response.status_code == 422
    assert "at least 10 characters" in response.json()["error"]["message"]


@pytest.mark.asyncio
async def test_change_password_flow(client):
    headers = await register_and_login(client)

    wrong_current = await client.post(
        "/auth/change-password",
        json={"current_password": "nope", "new_password": "Brand-New-Pass-9"},
        headers=headers,
    )
    weak = await client.post(
        "/auth/change-password",
        json={"current_password": GOOD, "new_password": "weak"},
        headers=headers,
    )
    same = await client.post(
        "/auth/change-password",
        json={"current_password": GOOD, "new_password": GOOD},
        headers=headers,
    )
    ok = await client.post(
        "/auth/change-password",
        json={"current_password": GOOD, "new_password": "Brand-New-Pass-9"},
        headers=headers,
    )

    assert wrong_current.status_code == 400
    assert weak.status_code == 422
    assert same.status_code == 422
    assert ok.status_code == 200
    assert (await _login(client, password=GOOD)).status_code == 401
    assert (await _login(client, password="Brand-New-Pass-9")).status_code == 200


@pytest.mark.asyncio
async def test_change_password_requires_auth(client):
    response = await client.post(
        "/auth/change-password",
        json={"current_password": "x", "new_password": "Brand-New-Pass-9"},
    )

    assert response.status_code == 401


# --- lockout ----------------------------------------------------------------


@pytest.mark.asyncio
async def test_account_locks_after_repeated_failures_even_for_the_right_password(
    client,
):
    await register_and_login(client)

    for _ in range(5):
        assert (await _login(client, password="wrong-password-1")).status_code == 401
    locked = await _login(client, password=GOOD)

    assert locked.status_code == 429
    assert int(locked.headers["retry-after"]) > 0
    assert "locked" in locked.json()["error"]["message"]


@pytest.mark.asyncio
async def test_lock_expires(client):
    await register_and_login(client)
    for _ in range(5):
        await _login(client, password="wrong-password-1")
    assert (await _login(client)).status_code == 429

    await _update_user(
        "admin@example.com", locked_until=datetime.now(UTC) - timedelta(seconds=1)
    )

    assert (await _login(client)).status_code == 200


@pytest.mark.asyncio
async def test_successful_login_resets_the_failure_counter(client):
    await register_and_login(client)

    for _ in range(3):
        await _login(client, password="wrong-password-1")
    assert (await _login(client)).status_code == 200
    for _ in range(3):
        await _login(client, password="wrong-password-1")

    assert (await _login(client)).status_code == 200  # never reached 5 in a row (kept under the per-IP login rate limit)


@pytest.mark.asyncio
async def test_unknown_email_is_a_plain_401_and_never_locks(client):
    statuses = {
        (await _login(client, email="ghost@example.com", password="x")).status_code
        for _ in range(8)
    }

    assert statuses == {401}


# --- forced password change ------------------------------------------------


@pytest.mark.asyncio
async def test_user_flagged_for_password_change_is_blocked_until_it_changes(client):
    headers = await register_and_login(client)
    await _update_user("admin@example.com", must_change_password=True)

    me = await client.get("/auth/me", headers=headers)
    blocked = await client.get("/branches", headers=headers)

    assert me.status_code == 200
    assert me.json()["must_change_password"] is True
    assert blocked.status_code == 403
    assert blocked.json()["error"]["message"] == "password change required"

    changed = await client.post(
        "/auth/change-password",
        json={"current_password": GOOD, "new_password": "Brand-New-Pass-9"},
        headers=headers,
    )
    assert changed.status_code == 200
    fresh = {"Authorization": f"Bearer {changed.json()['access_token']}"}
    assert (await client.get("/branches", headers=fresh)).status_code == 200
    assert (await client.get("/auth/me", headers=fresh)).json()[
        "must_change_password"
    ] is False


@pytest.mark.asyncio
async def test_admin_can_force_a_password_change(client):
    admin = await register_and_login(client)
    await client.post(
        "/auth/register",
        json={"name": "Op", "email": "op@example.com", "password": GOOD},
    )
    operator = await _user("op@example.com")

    response = await client.post(
        f"/auth/users/{operator.id}/force-password-change", headers=admin
    )
    missing = await client.post("/auth/users/9999/force-password-change", headers=admin)

    assert response.status_code == 200
    assert response.json()["must_change_password"] is True
    assert (await _user("op@example.com")).must_change_password is True
    assert missing.status_code == 404


# --- seed script -------------------------------------------------------------


def _run_seed(tmp_path, *args, password=None):
    env = {
        **os.environ,
        "DATABASE_URL": f"sqlite+aiosqlite:///{(tmp_path / 'seed.db').as_posix()}",
    }
    env.pop("ADMIN_PASSWORD", None)
    if password is not None:
        env["ADMIN_PASSWORD"] = password
    return subprocess.run(
        [sys.executable, "scripts/seed_admin_user.py", *args],
        capture_output=True,
        text=True,
        env=env,
        timeout=120,
    )


def test_seed_has_no_default_password(tmp_path):
    result = _run_seed(tmp_path)

    assert result.returncode != 0
    assert "no default" in (result.stdout + result.stderr)


def test_seed_rejects_weak_password_from_env(tmp_path):
    result = _run_seed(tmp_path, password="weak")

    assert result.returncode != 0
    assert "password needs" in (result.stdout + result.stderr)


def test_repo_ships_no_hardcoded_default_credential():
    with open("scripts/seed_admin_user.py", encoding="utf-8") as seed:
        assert "Admin123" not in seed.read()


# --- sessions end on a password change; failures are counted atomically ----------


@pytest.mark.asyncio
async def test_change_password_returns_a_working_token_pair_and_marks_the_change(
    client,
):
    headers = await register_and_login(client)

    changed = await client.post(
        "/auth/change-password",
        json={"current_password": GOOD, "new_password": "Brand-New-Pass-9"},
        headers=headers,
    )

    assert changed.status_code == 200
    fresh = {"Authorization": f"Bearer {changed.json()['access_token']}"}
    assert (await client.get("/auth/me", headers=fresh)).status_code == 200
    refreshed = await client.post(
        "/auth/refresh", json={"refresh_token": changed.json()["refresh_token"]}
    )
    assert refreshed.status_code == 200
    assert (await _user("admin@example.com")).password_changed_at is not None


@pytest.mark.asyncio
async def test_tokens_issued_before_the_password_change_are_refused(client):
    headers = await register_and_login(client)
    login = await client.post(
        "/auth/login", json={"email": "admin@example.com", "password": GOOD}
    )
    old_refresh = login.json()["refresh_token"]
    future = datetime.now(UTC) + timedelta(seconds=30)
    await _update_user("admin@example.com", password_changed_at=future)

    me = await client.get("/auth/me", headers=headers)
    refresh = await client.post("/auth/refresh", json={"refresh_token": old_refresh})

    assert me.status_code == 401
    assert refresh.status_code == 401


@pytest.mark.asyncio
async def test_refresh_is_refused_for_an_inactive_user(client):
    await register_and_login(client)
    login = await client.post(
        "/auth/login", json={"email": "admin@example.com", "password": GOOD}
    )
    await _update_user("admin@example.com", active=False)

    response = await client.post(
        "/auth/refresh", json={"refresh_token": login.json()["refresh_token"]}
    )

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_a_wrong_current_password_counts_toward_the_lockout(client):
    headers = await register_and_login(client)

    for _ in range(5):
        response = await client.post(
            "/auth/change-password",
            json={
                "current_password": "not-it-at-all-1",
                "new_password": "Brand-New-Pass-9",
            },
            headers=headers,
        )
        assert response.status_code == 400

    assert (await _login(client)).status_code == 429  # the account is now locked


@pytest.mark.asyncio
async def test_concurrent_wrong_passwords_are_all_counted(client):
    import asyncio

    await register_and_login(client)

    await asyncio.gather(
        *[_login(client, password="wrong-password-1") for _ in range(12)]
    )

    user = await _user("admin@example.com")
    assert user.locked_until is not None  # 12 attempts cannot slip under a limit of 5
